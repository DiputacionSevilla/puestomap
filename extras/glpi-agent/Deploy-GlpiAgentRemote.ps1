<#
  Despliegue REMOTO del GLPI Agent a partir de un CSV de un escaneo de IPs (p. ej. Advanced IP Scanner).

  Solo necesita SMB (puerto 445) y una cuenta administradora local en el destino; NO depende de
  WMI/DCOM ni WinRM. Para cada equipo del CSV:
    1. Comprueba el puerto 445 y abre \\IP\ADMIN$ con la cuenta indicada (comprobacion de permisos).
    2. Copia Glpi-Agent-Payload.ps1 y lo ejecuta como SYSTEM mediante un servicio temporal
       (igual que PsExec); lee el resultado desde ADMIN$ y borra el servicio y los ficheros.
    3. El payload verifica que es un puesto Windows (no servidor) y que el nombre coincide con el CSV.
       Instala el MSI si falta o es mas antiguo y, SOLO si el GLPI Agent queda instalado, desinstala
       FusionInventory Agent y OCS Inventory Agent.
    4. Anota el resultado en deploy-results-<fecha>.csv.

  MODOS
    (sin -Execute)  Simulacion: ejecuta el payload en modo Plan. No instala ni desinstala nada, pero crea
                    y borra un servicio temporal y ficheros en C:\Windows\Temp del destino.
    -CheckOnly      Solo abre ADMIN$ (lectura pura): comprueba alcance y permisos de la cuenta.
    -Execute        Despliegue real (pide escribir SI; -Force lo omite).

  Ejemplos
    .\Deploy-GlpiAgentRemote.ps1 -CsvPath .\escaneo.csv -MsiPath .\GLPI-Agent-1.21-x64.msi -CheckOnly -Credential (Get-Credential)
    .\Deploy-GlpiAgentRemote.ps1 -CsvPath .\escaneo.csv -MsiPath .\GLPI-Agent-1.21-x64.msi -Credential (Get-Credential)
    .\Deploy-GlpiAgentRemote.ps1 -CsvPath .\escaneo.csv -MsiPath .\GLPI-Agent-1.21-x64.msi -Only PC01,PC02 -Execute -Credential (Get-Credential)
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
    [string]   $ExcludeName = '^(SRV|SRW|SERVIDOR|DC\d|DATOS|VEEAM|SQL|NAS|IDRAC|DESKTOP-)',
    [switch]   $SkipRemoveOld,
    [switch]   $CheckOnly,
    [switch]   $Execute,
    [switch]   $Force,
    [string]   $ResultsPath = ''
)

$ErrorActionPreference = 'Stop'
if ($Tag -match '[\s"&|<>^%]') { throw 'El parametro -Tag no puede contener espacios ni caracteres especiales.' }
if ($Server -notmatch '^https://[^\s"&|<>^%]+$') { throw '-Server debe ser una URL https:// sin espacios.' }
if (-not (Test-Path -LiteralPath $MsiPath)) { throw "No existe el MSI: $MsiPath" }
if (-not (Test-Path -LiteralPath $CsvPath)) { throw "No existe el CSV: $CsvPath" }
if ($Execute -and $CheckOnly) { throw '-Execute y -CheckOnly son incompatibles.' }
$MsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
$PayloadPath = Join-Path $PSScriptRoot 'Glpi-Agent-Payload.ps1'
if (-not (Test-Path -LiteralPath $PayloadPath)) { throw "Falta $PayloadPath (debe estar junto a este script)." }
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
    $ipCol     = Pick @('ip', 'ipaddress', 'direccion', 'address', 'host')
    $nameCol   = Pick @('hostname', 'nombre', 'name', 'equipo', 'computer')
    $osCol     = Pick @('os', 'sistema', 'operatingsystem')
    $vendorCol = Pick @('fabricante', 'vendor', 'manufacturer')
    $stateCol  = Pick @('estado', 'status', 'state')
    if (-not $ipCol -and -not $nameCol) { throw "El CSV debe tener una columna de IP o de nombre. Columnas: $($props -join ', ')" }
    $seen = @{}
    foreach ($r in $rows) {
        $ip     = if ($ipCol)     { ([string]$r.$ipCol).Trim() } else { '' }
        $name   = if ($nameCol)   { ([string]$r.$nameCol).Trim() } else { '' }
        $os     = if ($osCol)     { ([string]$r.$osCol).Trim() } else { '' }
        $vendor = if ($vendorCol) { ([string]$r.$vendorCol).Trim() } else { '' }
        $state  = if ($stateCol)  { ([string]$r.$stateCol).Trim() } else { '' }
        if ($name -eq $ip) { $name = '' }   # los escaneres rellenan el nombre con la IP cuando no lo resuelven
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

function Get-MsiVersion([string]$Path) {
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $db = $installer.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $installer, @($Path, 0))
    $view = $db.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $db, @("SELECT Value FROM Property WHERE Property='ProductVersion'"))
    $view.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $view, $null) | Out-Null
    $record = $view.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $view, $null)
    $record.GetType().InvokeMember('StringData', 'GetProperty', $null, $record, 1)
}
$msiVersion = Get-MsiVersion $MsiPath
$modeText = if ($Execute) { 'REAL (instala y desinstala)' } elseif ($CheckOnly) { 'COMPROBACION (solo abre ADMIN$)' } else { 'SIMULACION (sin instalar ni desinstalar)' }
Write-Host ("Equipos a procesar: {0} | MSI {1} | Modo: {2}" -f $targets.Count, $msiVersion, $modeText)

if ($Execute -and -not $Force) {
    $answer = Read-Host "Se instalara el GLPI Agent y se desinstalaran OCS/FusionInventory en $($targets.Count) equipo(s) (los no aptos se omiten). Escribe SI para continuar"
    if ($answer -ne 'SI') { Write-Host 'Cancelado.'; return }
}

# ------------------------------ Trabajo por equipo (se ejecuta en un job) ------------------------------
$worker = {
    param($Item, $MsiPath, $PayloadPath, $MsiVersion, $Server, $Tag, $Credential, $Execute, $SkipRemoveOld, $CheckOnly, $TimeoutMinutes, $ExcludeVendor, $ExcludeName)
    $ErrorActionPreference = 'Stop'
    if ($Execute -isnot [bool] -or $SkipRemoveOld -isnot [bool] -or $CheckOnly -isnot [bool]) { throw 'Parametros de modo invalidos; se aborta por seguridad.' }
    $result = [ordered]@{ Target = $Item.Target; Hostname = $Item.Hostname; RemoteName = ''; Status = ''; Detail = ''; Time = (Get-Date -Format 's') }
    $drive = $null

    function Test-Port([string]$HostName, [int]$Port) {
        $tcp = New-Object System.Net.Sockets.TcpClient
        try { return $tcp.ConnectAsync($HostName, $Port).Wait(2500) } catch { return $false } finally { $tcp.Close() }
    }

    # Ejecuta el payload en el destino y devuelve su resultado (objeto) o lanza una excepcion
    function Invoke-Payload([string]$Addr, [string]$AdminRoot, [bool]$IsLocal, [string]$Mode, [bool]$CopyMsi, [string]$ExpectedName) {
        $id = 'gdp' + (Get-Date -Format 'HHmmss') + (Get-Random -Maximum 999)
        $tempLocal = Join-Path $AdminRoot 'Temp'
        $remoteTemp = if ($IsLocal) { $env:SystemRoot + '\Temp' } else { 'C:\Windows\Temp' }
        Copy-Item -LiteralPath $PayloadPath -Destination (Join-Path $tempLocal "$id.ps1") -Force
        $msiArg = ''
        if ($CopyMsi) {
            Copy-Item -LiteralPath $MsiPath -Destination (Join-Path $tempLocal "$id.msi") -Force
            $msiArg = " -MsiPath $remoteTemp\$id.msi"
        }
        $psArgs = "-NoProfile -ExecutionPolicy Bypass -File $remoteTemp\$id.ps1 -Mode $Mode -ResultFile $remoteTemp\$id.json -Server $Server -TargetVersion $MsiVersion$msiArg -RemoveOld $(if ($SkipRemoveOld) { 0 } else { 1 })"
        if ($Tag) { $psArgs += " -Tag $Tag" }
        if ($ExpectedName) { $psArgs += " -ExpectedName $ExpectedName" }
        $resultPath = Join-Path $tempLocal "$id.json"
        $created = $false
        try {
            if ($IsLocal) {
                $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $psArgs -Wait -PassThru -WindowStyle Hidden
            } else {
                # El .cmd lanza powershell desacoplado (start) para que el servicio termine al instante
                Set-Content -LiteralPath (Join-Path $tempLocal "$id.cmd") -Value ("@echo off`r`nstart `"`" /min powershell.exe $psArgs") -Encoding ASCII
                $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
                $out = & sc.exe "\\$Addr" create $id binPath= "cmd.exe /c $remoteTemp\$id.cmd" start= demand obj= LocalSystem 2>&1
                $code = $LASTEXITCODE
                $ErrorActionPreference = $prev
                if ($code -ne 0) { throw "sc create fallo ($code): $(($out | Out-String).Trim())" }
                $created = $true
                $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
                & sc.exe "\\$Addr" start $id 2>&1 | Out-Null   # devuelve 1053 (no responde al SCM): es lo esperado
                $ErrorActionPreference = $prev
            }
            $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
            while (-not (Test-Path -LiteralPath $resultPath) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 3 }
            if (-not (Test-Path -LiteralPath $resultPath)) { throw "Tiempo agotado ($TimeoutMinutes min) sin resultado del payload" }
            Start-Sleep -Milliseconds 500
            return (Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json)
        }
        finally {
            if ($created) {
                $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
                & sc.exe "\\$Addr" delete $id 2>&1 | Out-Null
                $ErrorActionPreference = $prev
            }
            foreach ($ext in 'ps1', 'cmd', 'json', 'msi') { Remove-Item -LiteralPath (Join-Path $tempLocal "$id.$ext") -Force -ErrorAction SilentlyContinue }
        }
    }

    try {
        $addr = $Item.Target
        if ($Item.Vendor -and $ExcludeVendor -and $Item.Vendor -match $ExcludeVendor) { $result.Status = 'OMITIDO'; $result.Detail = "Dispositivo no PC (fabricante: $($Item.Vendor))"; return [pscustomobject]$result }
        if ($Item.Hostname -and $ExcludeName -and $Item.Hostname -match $ExcludeName -and -not $CheckOnly) { $result.Status = 'OMITIDO'; $result.Detail = "Parece un servidor por el nombre ($($Item.Hostname)); use -ExcludeName '' para forzarlo"; return [pscustomobject]$result }
        if ($Item.State -and $Item.State -notmatch 'activ|active|up|online') { $result.Status = 'OMITIDO'; $result.Detail = "Estado en el escaneo: $($Item.State)"; return [pscustomobject]$result }
        if ($Item.Os -and $Item.Os -notmatch 'windows|win\d|microsoft') { $result.Status = 'OMITIDO'; $result.Detail = "Sistema no Windows ($($Item.Os))"; return [pscustomobject]$result }

        $localIps = @([System.Net.Dns]::GetHostAddresses($env:COMPUTERNAME) | ForEach-Object { $_.IPAddressToString }) + @('127.0.0.1', 'localhost', $env:COMPUTERNAME)
        $isLocal = $localIps -contains $addr
        if (-not $isLocal -and -not (Test-Port $addr 445)) { $result.Status = 'NO_ALCANZABLE'; $result.Detail = 'Puerto 445 cerrado o sin respuesta'; return [pscustomobject]$result }

        # Acceso a ADMIN$ con la cuenta indicada (abre una conexion SMB autenticada que reutiliza sc.exe)
        $driveName = 'GD' + ([guid]::NewGuid().ToString('N').Substring(0, 6))
        if ($isLocal) {
            $adminRoot = $env:SystemRoot + '\'
        } else {
            $dp = @{ Name = $driveName; PSProvider = 'FileSystem'; Root = "\\$addr\ADMIN`$"; ErrorAction = 'Stop' }
            if ($Credential) { $dp.Credential = $Credential }
            try { $drive = New-PSDrive @dp }
            catch {
                $result.Status = 'SIN_ACCESO_SMB'
                $result.Detail = "No se puede abrir ADMIN$ con la cuenta usada: $($_.Exception.Message.Trim())"
                return [pscustomobject]$result
            }
            $adminRoot = "\\$addr\ADMIN`$"   # UNC directo: la conexion SMB autenticada de New-PSDrive se reutiliza
        }
        if ($CheckOnly) { $result.Status = 'ACCESO_OK'; $result.Detail = 'ADMIN$ accesible con la cuenta usada'; return [pscustomobject]$result }

        $expected = $Item.Hostname
        $plan = Invoke-Payload $addr $adminRoot $isLocal 'Plan' $false $expected
        $result.RemoteName = [string]$plan.computer
        if (-not $Execute -or $plan.status -in 'NOMBRE_DISTINTO', 'OMITIDO', 'ERROR') {
            $result.Status = [string]$plan.status; $result.Detail = [string]$plan.detail
            return [pscustomobject]$result
        }
        if (-not $plan.needInstall -and (@($plan.old).Count -eq 0 -or $SkipRemoveOld)) {
            $result.Status = 'OK'; $result.Detail = "ya estaba ($($plan.glpiVersion)); nada que hacer"
            return [pscustomobject]$result
        }
        $apply = Invoke-Payload $addr $adminRoot $isLocal 'Apply' ([bool]$plan.needInstall) $expected
        $result.RemoteName = [string]$apply.computer
        $result.Status = [string]$apply.status; $result.Detail = [string]$apply.detail
        return [pscustomobject]$result
    }
    catch {
        $result.Status = 'ERROR'; $result.Detail = $_.Exception.Message
        return [pscustomobject]$result
    }
    finally {
        if ($drive) { Remove-PSDrive -Name $drive.Name -Force -ErrorAction SilentlyContinue }
    }
}

# ------------------------------ Ejecucion con limite de concurrencia ------------------------------
# Booleanos reales (un [bool]$x dentro de -ArgumentList se interpretaria como texto = siempre verdadero)
$executeFlag = [bool]$Execute.IsPresent
$skipRemoveFlag = [bool]$SkipRemoveOld.IsPresent
$checkOnlyFlag = [bool]$CheckOnly.IsPresent
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
        $job = Start-Job -ScriptBlock $worker -ArgumentList @($item, $MsiPath, $PayloadPath, $msiVersion, $Server, $Tag, $Credential, $executeFlag, $skipRemoveFlag, $checkOnlyFlag, $TimeoutMinutes, $ExcludeVendor, $ExcludeName)
        $running[$job] = $item
    }
    Start-Sleep -Milliseconds 500
    Receive-Finished
}

$results | Select-Object Target, Hostname, RemoteName, Status, Detail, Time | Export-Csv -LiteralPath $ResultsPath -NoTypeInformation -Encoding UTF8 -Delimiter ';'
Write-Host ''
$results | Group-Object Status | Sort-Object Count -Descending | ForEach-Object { Write-Host ("{0,-20} {1}" -f $_.Name, $_.Count) }
Write-Host "Resultados: $ResultsPath"
