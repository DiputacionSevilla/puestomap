<#
  Payload que Deploy-GlpiAgentRemote.ps1 copia y ejecuta EN cada equipo (como SYSTEM).
  Solo ASCII a proposito: se copia tal cual y se ejecuta con Windows PowerShell 5.1.

  -Mode Plan  : no cambia nada; informa de lo que haria.
  -Mode Apply : instala el GLPI Agent (si falta o es mas antiguo) y, solo si queda instalado,
                desinstala FusionInventory Agent y OCS Inventory Agent.
  Escribe un JSON con el resultado en -ResultFile.
#>
param(
    [Parameter(Mandatory)] [ValidateSet('Plan', 'Apply')] [string] $Mode,
    [Parameter(Mandatory)] [string] $ResultFile,
    [Parameter(Mandatory)] [string] $Server,
    [Parameter(Mandatory)] [string] $TargetVersion,
    [string] $MsiPath = 'C:\Windows\Temp\glpi-agent.msi',
    [string] $Tag = '',
    [string] $ExpectedName = '',
    [int]    $RemoveOld = 1,
    [string] $VncMsiPath = '',
    [string] $VncPasswordFile = ''
)

$ErrorActionPreference = 'Stop'
$r = [ordered]@{
    computer = $env:COMPUTERNAME; productType = $null; os = ''; status = ''; detail = '';
    glpiVersion = ''; old = @(); needInstall = $false; exitCode = $null; vnc = ''; needVnc = $false
}

function Save-Result {
    ($r | ConvertTo-Json -Compress -Depth 4) | Set-Content -LiteralPath $ResultFile -Encoding ASCII
}

function Get-Programs {
    $keys = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
    Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName } |
        Select-Object DisplayName, DisplayVersion, UninstallString, QuietUninstallString
}

function ConvertTo-SafeVersion([string]$Text) {
    $m = [regex]::Match($Text, '\d+(\.\d+){0,3}')
    if (-not $m.Success) { return $null }
    $parts = $m.Value.Split('.'); while ($parts.Count -lt 2) { $parts += '0' }
    try { return [version]($parts -join '.') } catch { return $null }
}

try {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    $r.productType = [int]$os.ProductType
    $r.os = [string]$os.Caption

    if ($ExpectedName -and $ExpectedName.Split('.')[0] -ne $env:COMPUTERNAME) {
        $r.status = 'NOMBRE_DISTINTO'; $r.detail = "El CSV dice $ExpectedName pero el equipo es $($env:COMPUTERNAME). No se toca."
        Save-Result; exit 0
    }
    if ($os.ProductType -ne 1) {
        $r.status = 'OMITIDO'; $r.detail = "No es un puesto de trabajo (ProductType $($os.ProductType)): $($os.Caption)"
        Save-Result; exit 0
    }

    $programs = @(Get-Programs)
    $glpi = $programs | Where-Object { $_.DisplayName -match '^GLPI[ -]Agent' } | Select-Object -First 1
    $old = @($programs | Where-Object { $_.DisplayName -match 'FusionInventory.*Agent|OCS Inventory.*Agent' })
    $target = ConvertTo-SafeVersion $TargetVersion
    $have = if ($glpi) { ConvertTo-SafeVersion $glpi.DisplayVersion } else { $null }
    $r.glpiVersion = if ($glpi) { [string]$glpi.DisplayVersion } else { '' }
    $r.old = @($old | ForEach-Object { [string]$_.DisplayName })
    $r.needInstall = [bool]((-not $glpi) -or ($have -and $target -and $have -lt $target))

    if ($VncMsiPath) {
        $vncSvc = Get-Service -Name 'tvnserver', 'uvnc_service', 'WinVNC4', 'vncserver' -ErrorAction SilentlyContinue | Select-Object -First 1
        $vncApp = $programs | Where-Object { $_.DisplayName -match 'VNC' -and $_.DisplayName -notmatch 'Viewer|Visor' } | Select-Object -First 1
        if ($vncSvc) { $r.vnc = "ya hay servicio VNC ($($vncSvc.Name))" }
        elseif ($vncApp) { $r.vnc = "VNC instalado sin servicio ($($vncApp.DisplayName)); revisar a mano" }
        else { $r.needVnc = $true; $r.vnc = 'falta' }
    }

    if ($Mode -eq 'Plan') {
        $plan = @()
        if ($r.needInstall) { $plan += "instalaria GLPI Agent $TargetVersion" } else { $plan += "GLPI Agent ya instalado ($($r.glpiVersion))" }
        if ($old.Count -gt 0 -and $RemoveOld) { $plan += 'desinstalaria: ' + ($r.old -join ' + ') }
        if ($VncMsiPath) { $plan += $(if ($r.needVnc) { 'instalaria TightVNC Server' } else { "VNC: $($r.vnc)" }) }
        $r.status = 'SIMULACION'; $r.detail = ($plan -join '; ') + " [$($os.Caption)]"
        Save-Result; exit 0
    }

    # ---- Apply ----
    if ($r.needInstall) {
        if (-not (Test-Path -LiteralPath $MsiPath)) { throw "No esta el MSI en $MsiPath" }
        $a = @('/i', "`"$MsiPath`"", '/qn', '/norestart', '/l*v', '"C:\Windows\Temp\glpi-agent-install.log"', "SERVER=$Server", 'ADD_FIREWALL_EXCEPTION=1', 'RUNNOW=1')
        if ($Tag) { $a += "TAG=$Tag" }
        $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList $a -Wait -PassThru
        $r.exitCode = $p.ExitCode
        if ($p.ExitCode -notin 0, 3010) {
            $r.status = 'ERROR_INSTALACION'; $r.detail = "msiexec devolvio $($p.ExitCode) (log: C:\Windows\Temp\glpi-agent-install.log)"
            Save-Result; exit 0
        }
    }

    $after = @(Get-Programs)
    $nowGlpi = $after | Where-Object { $_.DisplayName -match '^GLPI[ -]Agent' } | Select-Object -First 1
    if (-not $nowGlpi) {
        $r.status = 'ERROR_VERIFICACION'; $r.detail = 'El GLPI Agent no aparece tras la instalacion; no se desinstala nada.'
        Save-Result; exit 0
    }
    $r.glpiVersion = [string]$nowGlpi.DisplayVersion

    $notes = @()
    if ($RemoveOld) {
        foreach ($app in ($after | Where-Object { $_.DisplayName -match 'FusionInventory.*Agent|OCS Inventory.*Agent' })) {
            $cmd = if ($app.QuietUninstallString) { $app.QuietUninstallString } else { $app.UninstallString }
            $guid = [regex]::Match([string]$cmd, '\{[0-9A-Fa-f-]{36}\}').Value
            if ($guid) {
                $p = Start-Process msiexec.exe -ArgumentList '/x', $guid, '/qn', '/norestart' -Wait -PassThru
            } else {
                $exe = ([regex]::Match([string]$cmd, '^"?([^"]+?\.exe)"?')).Groups[1].Value
                if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { $notes += "$($app.DisplayName): sin comando de desinstalacion"; continue }
                $p = Start-Process -FilePath $exe -ArgumentList '/S' -Wait -PassThru
            }
            $notes += "$($app.DisplayName): " + $(if ($p.ExitCode -in 0, 3010) { 'desinstalado' } else { "error $($p.ExitCode)" })
        }
    }
    if ($r.needVnc) {
        $pw = ''
        try {
            if ($VncPasswordFile -and (Test-Path -LiteralPath $VncPasswordFile)) { $pw = [System.IO.File]::ReadAllText($VncPasswordFile) }
        }
        finally {
            if ($VncPasswordFile) { Remove-Item -LiteralPath $VncPasswordFile -Force -ErrorAction SilentlyContinue }
        }
        if (-not $pw) { $notes += 'VNC: no llego la contrasena; no instalado' }
        elseif (-not (Test-Path -LiteralPath $VncMsiPath)) { $notes += 'VNC: falta el MSI; error' }
        else {
            # Sin log de msiexec a proposito: las propiedades llevan la contrasena
            $va = @('/i', "`"$VncMsiPath`"", '/qn', '/norestart', 'ADDLOCAL=Server', 'SERVER_REGISTER_AS_SERVICE=1', 'SERVER_ADD_FIREWALL_EXCEPTION=1',
                'SET_USEVNCAUTHENTICATION=1', 'VALUE_OF_USEVNCAUTHENTICATION=1', 'SET_PASSWORD=1', "VALUE_OF_PASSWORD=$pw",
                'SET_USECONTROLAUTHENTICATION=1', 'VALUE_OF_USECONTROLAUTHENTICATION=1', 'SET_CONTROLPASSWORD=1', "VALUE_OF_CONTROLPASSWORD=$pw")
            $pv = Start-Process -FilePath 'msiexec.exe' -ArgumentList $va -Wait -PassThru
            $svcNow = Get-Service -Name 'tvnserver' -ErrorAction SilentlyContinue
            if (($pv.ExitCode -in 0, 3010) -and $svcNow) { $notes += 'TightVNC instalado' } else { $notes += "VNC: error msiexec $($pv.ExitCode)" }
        }
    }
    $r.status = if ($notes -match 'error|sin comando|VNC:') { 'OK_CON_AVISOS' } else { 'OK' }
    $r.detail = (@($(if ($r.needInstall) { "instalado $($r.glpiVersion)" } else { "ya estaba ($($r.glpiVersion))" })) + $notes) -join '; '
    Save-Result; exit 0
}
catch {
    $r.status = 'ERROR'; $r.detail = $_.Exception.Message
    Save-Result; exit 1
}
