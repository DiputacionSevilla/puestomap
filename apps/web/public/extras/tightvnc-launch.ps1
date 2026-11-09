# PuestoMap - lanzador del protocolo tightvnc://
# Recibe una URL tipo tightvnc://10.1.2.34:5900/ y abre TightVNC Viewer.
# Valida estrictamente la entrada para evitar inyeccion de argumentos.
param([Parameter(Mandatory = $true)][string]$Uri)

$m = [regex]::Match($Uri, '^tightvnc://(?<h>[A-Za-z0-9.\-]{1,253})(:(?<p>\d{1,5}))?/?$')
if (-not $m.Success) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("URL no valida: $Uri", "PuestoMap") | Out-Null
    exit 1
}

$targetHost = $m.Groups['h'].Value
$port = if ($m.Groups['p'].Success) { [int]$m.Groups['p'].Value } else { 5900 }
if ($port -lt 1 -or $port -gt 65535) { exit 1 }

$candidates = @(
    (Join-Path $env:ProgramFiles 'TightVNC\tvnviewer.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'TightVNC\tvnviewer.exe')
)
$viewer = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $viewer) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("No se encuentra tvnviewer.exe. Instala TightVNC Viewer.", "PuestoMap") | Out-Null
    exit 2
}

# Sintaxis TightVNC 2.x: host::puerto (verificar con 'tvnviewer.exe -help' si cambia la version)
Start-Process -FilePath $viewer -ArgumentList ('{0}::{1}' -f $targetHost, $port)
