<#
  Despliegue REMOTO del GLPI Agent a partir de un CSV de un escáner de IPs.

  Para cada equipo del CSV:
    1. Comprueba que responde (TCP 135/445) y que es Windows.
    2. Se conecta por CIM/DCOM (sin WinRM), consulta el software instalado.
    3. Si falta el GLPI Agent (o es más antiguo que el MSI): copia el MSI por \\IP\ADMIN$ y lo instala.
    4. Solo si el GLPI Agent queda instalado: desinstala FusionInventory Agent y OCS Inventory Agent.
    5. Anota el resultado en un CSV (deploy-results-<fecha>.csv).

  SEGURO POR DEFECTO: sin -Execute solo hace comprobaciones de lectura y dice qué haría.

  Ejemplos
    # Simulación sobre todo el CSV (no cambia nada):
    .\Deploy-GlpiAgentRemote.ps1 -CsvPath .\escaneo.csv -MsiPath .\GLPI-Agent-1.21-x64.msi
    # Piloto real con 5 equipos:
    .\Deploy-GlpiAgentRemote.ps1 -CsvPath .\escaneo.csv -MsiPath .\GLPI-Agent-1.21-x64.msi -Only PC01,PC02 -Execute
    # Lote real de 20 equipos con otra cuenta:
    .\Deploy-GlpiAgentRemote.ps1 -CsvPath .\escaneo.csv -MsiPath .\agent.msi -Credential (Get-Credential) -Limit 20 -Execute

  Requisitos en los equipos destino: cuenta con permisos de administrador local (p. ej. administrador
  de dominio), puertos 135 y 445 accesibles desde este PC y la regla de firewall «Administración
  remota de Windows (DCOM/WMI)». Ver README.md.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $CsvPath,
    [Parameter(Mandatory)] [string] $MsiPath,
    [string]   $Server = 'https://soporte.mairenadelalcor.net/glpi/front/inventory.php',
    [string]   $Tag = '',
    [pscredential] $Credential,
    [string[]] $Only,
    [int]      $Limit = 0,
    [int]      $Throttle = 8,
    [int]      $TimeoutMinutes = 10,
    [string]   $ExcludeVendor = 'RICOH|Synology|Sonic\s?wall|CARRIER ACCESS|Brother|Kyocera|Lexmark|Xerox|Canon|EPSON|\bOKI\b|Ubiquiti|MikroTik|Zyxel|Fortinet|Cisco|Hikvision|Dahua|APC|QNAP',
    [switch]   $SkipRemoveOld,
    [switch]   $Execute,
    [switch]   $Force,
    [string]   $ResultsPath = ''
)

$ErrorActionPreference = 'Stop'
if ($Tag -match '[\s"&|<>^%]') { throw 'El parámetro -Tag no puede contener espacios ni caracteres especiales.' }
if ($Server -notmatch '^https://[^\s"&|<>^%]+$') { throw '-Server debe ser una URL https:// sin espacios.' }
if (-not (Test-Path -LiteralPath $MsiPath)) { throw "No existe el MSI: $MsiPath" }
if (-not (Test-Path -LiteralPath $CsvPath)) { throw "No existe el CSV: $CsvPath" }
$MsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
if (-not $ResultsPath) { $ResultsPath = Join-Path (Get-Location) ('deploy-results-{0:yyyyMMdd-HHmmss}.csv' -f (Get-Date)) }

# ------------------------------ Lectura del CSV de escaneo ------------------------------
function Read-ScanCsv([string]$Path) {
    $first = (Get-Content -LiteralPath $Path -TotalCount 1)
    $counts = @{ "`t" = 0; ';' = 0; ',' = 0 }
    foreach ($ch in $first.ToCharArray()) { if ($counts.ContainsKey([string]$ch)) { $counts[[string]$ch]++ } }
    $delimiter = ($counts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
    $rows = Import-Csv -LiteralPath $Path -Delimiter $delimiter
    if (-not $rows) { return @() }
    $props = $rows[0].PSObject.Properties.Name
    function Pick([string[]]$names) {
        foreach ($n in $names) { $m = $props | Where-Object { $_ -ieq $n } | Select-Object -First 1; if ($m) { return $m } }
        foreach ($n in $names) { $m = $props | Where-Object { $_ -match ('^' + [regex]::Escape($n) + '\b') } | Select-Object -First 1; if ($m) { return $m } }
        return $null
    }
    $ipCol   = Pick @('ip', 'ipaddress', 'direccion', 'address', 'host')
    $nameCol = Pick @('hostname', 'nombre', 'name', 'equipo', 'computer')
    $osCol   = Pick @('os', 'sistema', 'operatingsystem')
    $vendorCol = Pick @('fabricante', 'vendor', 'manufacturer')
    $stateCol  = Pick @('estado', 'status', 'state')
    if (-not $ipCol -and -not $nameCol) { throw "El CSV debe tener una columna de IP o de nombre. Columnas: $($props -join ', ')" }
    $seen = @{}
    foreach ($r in $rows) {
        $ip   = if ($ipCol)   { ([string]$r.$ipCol).Trim() } else { '' }
        $name = if ($nameCol) { ([string]$r.$nameCol).Trim() } else { '' }
        $os   = if ($osCol)   { ([string]$r.$osCol).Trim() } else { '' }
        $vendor = if ($vendorCol) { ([string]$r.$vendorCol).Trim() } else { '' }
        $state  = if ($stateCol)  { ([string]$r.$stateCol).Trim() } else { '' }
        if ($name -eq $ip) { $name = '' }   # los escáneres rellenan el nombre con la IP cuando no lo resuelven
        $target = if ($ip) { $ip } else { $name }
        if (-not $target -or $seen.ContainsKey($target)) { continue }
        $seen[$target] = $true
        [pscustomobject]@{ Target = $target; Ip = $ip; Hostname = $name; Os = $os; Vendor = $vendor; State = $state }
    }
}

$targets = @(Read-ScanCsv $CsvPath)
if ($Only) { $targets = @($targets | Where-Object { $Only -contains $_.Hostname -or $Only -contains $_.Ip -or $Only -contains $_.Target }) }
if ($Limit -gt 0) { $targets = @($targets | Select-Object -First $Limit) }
if ($targets.Count -eq 0) { Write-Warning 'No hay equipos que procesar.'; return }

# Versión del MSI (una sola vez)
function Get-MsiVersion([string]$Path) {
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $db = $installer.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $installer, @($Path, 0))
    $view = $db.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $db, @("SELECT Value FROM Property WHERE Property='ProductVersion'"))
    $view.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $view, $null) | Out-Null
    $record = $view.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $view, $null)
    $record.GetType().InvokeMember('StringData', 'GetProperty', $null, $record, 1)
}
$msiVersion = Get-MsiVersion $MsiPath

Write-Host ("Equipos a procesar: {0} | MSI {1} | Modo: {2}" -f $targets.Count, $msiVersion, $(if ($Execute) { 'REAL (instala y desinstala)' } else { 'SIMULACIÓN (solo lectura)' }))

if ($Execute -and -not $Force) {
    $answer = Read-Host "Se instalará el GLPI Agent y se desinstalarán OCS/FusionInventory en $($targets.Count) equipo(s). Escribe SI para continuar"
    if ($answer -ne 'SI') { Write-Host 'Cancelado.'; return }
}

# ------------------------------ Trabajo por equipo (se ejecuta en un job) ------------------------------
$worker = {
    param($Item, $MsiPath, $MsiVersion, $Server, $Tag, $Credential, $Execute, $SkipRemoveOld, $TimeoutMinutes, $ExcludeVendor)
    $ErrorActionPreference = 'Stop'
    if ($Execute -isnot [bool] -or $SkipRemoveOld -isnot [bool]) { throw 'Parámetros de modo inválidos; se aborta por seguridad.' }
    $result = [ordered]@{ Target = $Item.Target; Hostname = $Item.Hostname; RemoteName = ''; Status = ''; Detail = ''; Time = (Get-Date -Format 's') }
    $cim = $null; $drive = $null
    function Test-Port([string]$HostName, [int]$Port) {
        $tcp = New-Object System.Net.Sockets.TcpClient
        try { return $tcp.ConnectAsync($HostName, $Port).Wait(2500) } catch { return $false } finally { $tcp.Close() }
    }
    function Get-Programs($Session) {
        $hklm = [uint32]2147483650
        $out = @()
        foreach ($sub in 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') {
            $keys = (Invoke-CimMethod -CimSession $Session -Namespace root/default -ClassName StdRegProv -MethodName EnumKey -Arguments @{ hDefKey = $hklm; sSubKeyName = $sub }).sNames
            foreach ($k in $keys) {
                $path = "$sub\$k"
                $name = (Invoke-CimMethod -CimSession $Session -Namespace root/default -ClassName StdRegProv -MethodName GetStringValue -Arguments @{ hDefKey = $hklm; sSubKeyName = $path; sValueName = 'DisplayName' }).sValue
                if (-not $name -or $name -notmatch 'GLPI[ -]Agent|FusionInventory.*Agent|OCS Inventory.*Agent') { continue }
                $get = { param($v) (Invoke-CimMethod -CimSession $Session -Namespace root/default -ClassName StdRegProv -MethodName GetStringValue -Arguments @{ hDefKey = $hklm; sSubKeyName = $path; sValueName = $v }).sValue }
                $out += [pscustomobject]@{ Key = $k; DisplayName = $name; DisplayVersion = (& $get 'DisplayVersion'); Uninstall = (& $get 'UninstallString'); Quiet = (& $get 'QuietUninstallString') }
            }
        }
        $out
    }
    function ConvertTo-SafeVersion([string]$Text) {
        $m = [regex]::Match($Text, '\d+(\.\d+){0,3}')
        if (-not $m.Success) { return $null }
        $parts = $m.Value.Split('.'); while ($parts.Count -lt 2) { $parts += '0' }
        try { return [version]($parts -join '.') } catch { return $null }
    }
    function Invoke-RemoteBatch($Session, [string]$AdminRoot, [string]$Name, [string[]]$Lines, [int]$TimeoutMin) {
        # Escribe un .cmd en C:\Windows\Temp, lo ejecuta y lee el código de salida del fichero .rc
        $local = Join-Path $AdminRoot "Temp\$Name.cmd"
        $rc    = Join-Path $AdminRoot "Temp\$Name.rc"
        Remove-Item -LiteralPath $rc -ErrorAction SilentlyContinue
        Set-Content -LiteralPath $local -Value (@('@echo off') + $Lines + @("echo %errorlevel%> C:\Windows\Temp\$Name.rc")) -Encoding ASCII
        $created = Invoke-CimMethod -CimSession $Session -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "cmd.exe /c C:\Windows\Temp\$Name.cmd" }
        if ($created.ReturnValue -ne 0) { throw "No se pudo lanzar el proceso remoto (código $($created.ReturnValue))" }
        $deadline = (Get-Date).AddMinutes($TimeoutMin)
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 3
            if (-not (Get-CimInstance -CimSession $Session -ClassName Win32_Process -Filter "ProcessId=$($created.ProcessId)" -ErrorAction SilentlyContinue)) { break }
        }
        if (-not (Test-Path -LiteralPath $rc)) { throw "Tiempo agotado ($TimeoutMin min) o sin código de salida" }
        $code = [int]((Get-Content -LiteralPath $rc -Raw).Trim())
        Remove-Item -LiteralPath $local, $rc -ErrorAction SilentlyContinue
        $code
    }

    try {
        $addr = $Item.Target
        if ($Item.Vendor -and $ExcludeVendor -and $Item.Vendor -match $ExcludeVendor) { $result.Status = 'OMITIDO'; $result.Detail = "Dispositivo no PC (fabricante: $($Item.Vendor))"; return [pscustomobject]$result }
        if ($Item.State -and $Item.State -notmatch 'activ|active|up|online') { $result.Status = 'OMITIDO'; $result.Detail = "Estado en el escaneo: $($Item.State)"; return [pscustomobject]$result }
        if ($Item.Os -and $Item.Os -notmatch 'windows|win\d|microsoft') { $result.Status = 'OMITIDO'; $result.Detail = "Sistema no Windows ($($Item.Os))"; return [pscustomobject]$result }
        if (-not (Test-Port $addr 445) -or -not (Test-Port $addr 135)) { $result.Status = 'NO_ALCANZABLE'; $result.Detail = 'Puertos 135/445 cerrados o sin respuesta'; return [pscustomobject]$result }

        $opt = New-CimSessionOption -Protocol Dcom
        $params = @{ ComputerName = $addr; SessionOption = $opt; OperationTimeoutSec = 60; ErrorAction = 'Stop' }
        if ($Credential) { $params.Credential = $Credential }
        $cim = New-CimSession @params
        $cs = Get-CimInstance -CimSession $cim -ClassName Win32_ComputerSystem
        $os = Get-CimInstance -CimSession $cim -ClassName Win32_OperatingSystem
        $result.RemoteName = $cs.Name
        if ($Item.Hostname -and $cs.Name -and ($Item.Hostname.Split('.')[0] -ne $cs.Name)) {
            $result.Status = 'NOMBRE_DISTINTO'; $result.Detail = "El CSV dice $($Item.Hostname) pero responde $($cs.Name) (¿DHCP?). No se toca."
            return [pscustomobject]$result
        }
        if ($os.ProductType -ne 1) { $result.Status = 'OMITIDO'; $result.Detail = "No es un puesto de trabajo (ProductType $($os.ProductType)): $($os.Caption)"; return [pscustomobject]$result }

        $programs = @(Get-Programs $cim)
        $glpi = $programs | Where-Object { $_.DisplayName -match '^GLPI[ -]Agent' } | Select-Object -First 1
        $old  = @($programs | Where-Object { $_.DisplayName -match 'FusionInventory.*Agent|OCS Inventory.*Agent' })
        $target = ConvertTo-SafeVersion $MsiVersion
        $have = if ($glpi) { ConvertTo-SafeVersion $glpi.DisplayVersion } else { $null }
        $needInstall = (-not $glpi) -or ($have -and $target -and $have -lt $target)
        $oldNames = ($old | ForEach-Object { $_.DisplayName }) -join ' + '

        if (-not $Execute) {
            $plan = @()
            if ($needInstall) { $plan += "instalaría GLPI Agent $MsiVersion" } else { $plan += "GLPI Agent ya instalado ($($glpi.DisplayVersion))" }
            if ($old.Count -gt 0 -and -not $SkipRemoveOld) { $plan += "desinstalaría: $oldNames" }
            $result.Status = 'SIMULACION'; $result.Detail = ($plan -join '; ') + " [$($os.Caption)]"
            return [pscustomobject]$result
        }

        # --- Acceso SMB a ADMIN$ ---
        $driveName = 'GD' + ([guid]::NewGuid().ToString('N').Substring(0, 6))
        $dp = @{ Name = $driveName; PSProvider = 'FileSystem'; Root = "\\$addr\ADMIN`$"; ErrorAction = 'Stop' }
        if ($Credential) { $dp.Credential = $Credential }
        $drive = New-PSDrive @dp
        $adminRoot = "${driveName}:\"
        $stamp = Get-Date -Format 'yyyyMMddHHmmss'

        if ($needInstall) {
            $remoteMsi = Join-Path $adminRoot 'Temp\glpi-agent.msi'
            Copy-Item -LiteralPath $MsiPath -Destination $remoteMsi -Force
            $msiArgs = "/i C:\Windows\Temp\glpi-agent.msi /qn /norestart /l*v C:\Windows\Temp\glpi-agent-install.log SERVER=$Server ADD_FIREWALL_EXCEPTION=1 RUNNOW=1"
            if ($Tag) { $msiArgs += " TAG=$Tag" }
            $code = Invoke-RemoteBatch $cim $adminRoot "glpi-install-$stamp" @("start /wait msiexec.exe $msiArgs") $TimeoutMinutes
            Remove-Item -LiteralPath $remoteMsi -ErrorAction SilentlyContinue
            if ($code -notin 0, 3010) { $result.Status = 'ERROR_INSTALACION'; $result.Detail = "msiexec devolvió $code (log remoto: C:\Windows\Temp\glpi-agent-install.log)"; return [pscustomobject]$result }
        }

        # Verificar que el agente nuevo está instalado antes de tocar nada más
        $after = @(Get-Programs $cim)
        if (-not ($after | Where-Object { $_.DisplayName -match '^GLPI[ -]Agent' })) {
            $result.Status = 'ERROR_VERIFICACION'; $result.Detail = 'El GLPI Agent no aparece tras la instalación; no se desinstala nada.'; return [pscustomobject]$result
        }

        $removed = @()
        if (-not $SkipRemoveOld) {
            $i = 0
            foreach ($app in ($after | Where-Object { $_.DisplayName -match 'FusionInventory.*Agent|OCS Inventory.*Agent' })) {
                $cmd = if ($app.Quiet) { $app.Quiet } else { $app.Uninstall }
                $guid = [regex]::Match([string]$cmd, '\{[0-9A-Fa-f-]{36}\}').Value
                $line = $null
                if ($guid) { $line = "start /wait msiexec.exe /x $guid /qn /norestart" }
                else {
                    $exe = ([regex]::Match([string]$cmd, '^"?([^"]+?\.exe)"?')).Groups[1].Value
                    if ($exe) { $line = "start /wait `"`" `"$exe`" /S" }
                }
                if (-not $line) { $removed += "$($app.DisplayName): sin comando de desinstalación"; continue }
                $i++
                $code = Invoke-RemoteBatch $cim $adminRoot "glpi-uninstall-$stamp-$i" @($line) $TimeoutMinutes
                $removed += "$($app.DisplayName): " + $(if ($code -in 0, 3010) { 'desinstalado' } else { "error $code" })
            }
        }
        $result.Status = if ($removed -match 'error|sin comando') { 'OK_CON_AVISOS' } else { 'OK' }
        $result.Detail = (@($(if ($needInstall) { "instalado $MsiVersion" } else { "ya estaba ($($glpi.DisplayVersion))" })) + $removed) -join '; '
        return [pscustomobject]$result
    }
    catch {
        $result.Status = 'ERROR'; $result.Detail = $_.Exception.Message
        return [pscustomobject]$result
    }
    finally {
        if ($drive) { Remove-PSDrive -Name $drive.Name -Force -ErrorAction SilentlyContinue }
        if ($cim) { Remove-CimSession -CimSession $cim -ErrorAction SilentlyContinue }
    }
}

# ------------------------------ Ejecución con límite de concurrencia ------------------------------
# Booleanos reales (un [bool]$x dentro de -ArgumentList se interpretaría como texto = siempre verdadero)
$executeFlag = [bool]$Execute.IsPresent
$skipRemoveFlag = [bool]$SkipRemoveOld.IsPresent
$results = New-Object System.Collections.Generic.List[object]
$running = @{}
$queue = New-Object System.Collections.Queue
$targets | ForEach-Object { $queue.Enqueue($_) }
$total = $targets.Count
$done = 0

function Receive-Finished {
    foreach ($job in @($running.Keys)) {
        if ($job.State -in 'Completed', 'Failed', 'Stopped') {
            $item = $running[$job]
            $out = $null
            try { $out = Receive-Job -Job $job -ErrorAction Stop } catch { $out = [pscustomobject]@{ Target = $item.Target; Hostname = $item.Hostname; RemoteName = ''; Status = 'ERROR'; Detail = $_.Exception.Message; Time = (Get-Date -Format 's') } }
            Remove-Job -Job $job -Force
            $running.Remove($job)
            $row = @($out) | Select-Object -Last 1
            $results.Add($row)
            $script:done++
            Write-Host ("[{0}/{1}] {2,-16} {3,-18} {4}" -f $script:done, $total, $row.Target, $row.Status, $row.Detail)
        }
    }
}

while ($queue.Count -gt 0 -or $running.Count -gt 0) {
    while ($queue.Count -gt 0 -and $running.Count -lt $Throttle) {
        $item = $queue.Dequeue()
        $job = Start-Job -ScriptBlock $worker -ArgumentList @($item, $MsiPath, $msiVersion, $Server, $Tag, $Credential, $executeFlag, $skipRemoveFlag, $TimeoutMinutes, $ExcludeVendor)
        $running[$job] = $item
    }
    Start-Sleep -Milliseconds 500
    Receive-Finished
}

$results | Select-Object Target, Hostname, RemoteName, Status, Detail, Time | Export-Csv -LiteralPath $ResultsPath -NoTypeInformation -Encoding UTF8 -Delimiter ';'
Write-Host ''
$results | Group-Object Status | Sort-Object Count -Descending | ForEach-Object { Write-Host ("{0,-20} {1}" -f $_.Name, $_.Count) }
Write-Host "Resultados: $ResultsPath"
