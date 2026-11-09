<#
  Despliegue automático del GLPI Agent por GPO (script de INICIO DEL EQUIPO).

  - Idempotente: si el agente ya está en la versión del MSI (o superior), no hace nada.
  - Instala primero el agente nuevo y SOLO si tiene éxito desinstala FusionInventory/OCS.
  - Modo piloto: si $PilotComputers no está vacío, solo actúa en esos equipos.
  - Modo simulación: $DryRun = $true registra lo que haría sin instalar ni desinstalar nada.
  - Log local: C:\ProgramData\GlpiAgentDeploy.log

  PROBAR PRIMERO en el piloto. Ver README.md.
#>

# ------------------------- CONFIGURACIÓN (editar) -------------------------
$Server        = 'https://soporte.mairenadelalcor.net/glpi/front/inventory.php'
$MsiPath       = '\\CAMBIAR-SERVIDOR\NETLOGON\glpi-agent\GLPI-Agent-CAMBIAR-x64.msi'  # lectura para "Equipos del dominio"
$Tag           = ''                 # opcional (p. ej. edificio); vacío = sin etiqueta
$PilotComputers = @()               # p. ej. @('PC-PILOTO1','PC-PILOTO2'); vacío = todos los equipos
$RemoveOldAgents = $true            # desinstalar FusionInventory-Agent y OCS Inventory Agent
$DryRun        = $false             # $true = solo registrar
# --------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$Log = Join-Path $env:ProgramData 'GlpiAgentDeploy.log'

function Write-Log([string]$Message) {
    $line = '{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}' -f (Get-Date), $env:COMPUTERNAME, $Message
    try { Add-Content -Path $Log -Value $line -Encoding UTF8 } catch { }
}

function Get-InstalledPrograms {
    $keys = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName } |
        Select-Object DisplayName, DisplayVersion, UninstallString, QuietUninstallString, PSChildName
}

function Get-MsiVersion([string]$Path) {
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $db = $installer.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $installer, @($Path, 0))
    $view = $db.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $db, @("SELECT Value FROM Property WHERE Property='ProductVersion'"))
    $view.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $view, $null) | Out-Null
    $record = $view.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $view, $null)
    $record.GetType().InvokeMember('StringData', 'GetProperty', $null, $record, 1)
}

function ConvertTo-SafeVersion([string]$Text) {
    $m = [regex]::Match($Text, '\d+(\.\d+){0,3}')
    if (-not $m.Success) { return $null }
    $parts = $m.Value.Split('.')
    while ($parts.Count -lt 2) { $parts += '0' }
    try { return [version]($parts -join '.') } catch { return $null }
}

try {
    if ($PilotComputers.Count -gt 0 -and ($PilotComputers -notcontains $env:COMPUTERNAME)) { exit 0 }

    # Sin red hacia GLPI (portátil fuera de la red municipal): salir sin error, se reintenta en el próximo arranque
    $uri = [uri]$Server
    $tcp = New-Object System.Net.Sockets.TcpClient
    $reachable = $false
    try { $reachable = $tcp.ConnectAsync($uri.Host, 443).Wait(3000) } catch { } finally { $tcp.Close() }
    if (-not $reachable) { Write-Log "GLPI no alcanzable ($($uri.Host):443); se reintentará."; exit 0 }

    if (-not (Test-Path $MsiPath)) { Write-Log "MSI no accesible: $MsiPath"; exit 1 }

    $programs = Get-InstalledPrograms
    $current  = $programs | Where-Object { $_.DisplayName -match '^GLPI[ -]Agent' } | Select-Object -First 1
    $target   = ConvertTo-SafeVersion (Get-MsiVersion $MsiPath)
    if (-not $target) { Write-Log 'No se pudo leer la versión del MSI; no se hace nada.'; exit 1 }

    $needInstall = $true
    if ($current) {
        $have = ConvertTo-SafeVersion $current.DisplayVersion
        if ($have -and $have -ge $target) { $needInstall = $false }
        elseif (-not $have) { Write-Log "Versión instalada ilegible ($($current.DisplayVersion)); no se toca."; $needInstall = $false }
    }

    if ($needInstall) {
        $args = @('/i', "`"$MsiPath`"", '/qn', '/norestart', "SERVER=$Server", 'ADD_FIREWALL_EXCEPTION=1', 'RUNNOW=1')
        if ($Tag) { $args += "TAG=$Tag" }
        Write-Log "Instalar GLPI Agent $target : msiexec $($args -join ' ')"
        if (-not $DryRun) {
            $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList $args -Wait -PassThru
            if ($p.ExitCode -notin 0, 3010) { Write-Log "msiexec falló con código $($p.ExitCode)"; exit 1 }
            Write-Log "Instalación correcta (código $($p.ExitCode))."
        }
    } else {
        Write-Log "GLPI Agent ya instalado ($($current.DisplayVersion)); nada que hacer."
    }

    # Retirar agentes antiguos solo si el nuevo está (o acaba de quedar) instalado
    if ($RemoveOldAgents -and -not $DryRun) {
        $now = Get-InstalledPrograms
        if ($now | Where-Object { $_.DisplayName -match '^GLPI[ -]Agent' }) {
            $old = $now | Where-Object { $_.DisplayName -match 'FusionInventory.*Agent|OCS Inventory.*Agent' }
            foreach ($app in $old) {
                $cmd = if ($app.QuietUninstallString) { $app.QuietUninstallString } else { $app.UninstallString }
                if (-not $cmd) { continue }
                if ($cmd -match 'msiexec') {
                    $guid = [regex]::Match($cmd, '\{[0-9A-Fa-f-]{36}\}').Value
                    if (-not $guid) { continue }
                    Write-Log "Desinstalar $($app.DisplayName) (MSI $guid)"
                    Start-Process msiexec.exe -ArgumentList '/x', $guid, '/qn', '/norestart' -Wait | Out-Null
                } else {
                    $exe = ([regex]::Match($cmd, '^"?([^"]+?\.exe)"?')).Groups[1].Value
                    if (-not (Test-Path $exe)) { continue }
                    Write-Log "Desinstalar $($app.DisplayName) ($exe /S)"
                    Start-Process -FilePath $exe -ArgumentList '/S' -Wait | Out-Null
                }
            }
        }
    } elseif ($RemoveOldAgents -and $DryRun) {
        $old = Get-InstalledPrograms | Where-Object { $_.DisplayName -match 'FusionInventory.*Agent|OCS Inventory.*Agent' }
        foreach ($app in $old) { Write-Log "[DryRun] Desinstalaría: $($app.DisplayName)" }
    }
    exit 0
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
