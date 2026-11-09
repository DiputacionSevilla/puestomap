# PuestoMap - registra el protocolo tightvnc:// para el usuario actual (no requiere administrador)
# Uso: clic derecho > Ejecutar con PowerShell, o:
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
$ErrorActionPreference = 'Stop'

$destDir = Join-Path $env:LOCALAPPDATA 'PuestoMap'
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$script = Join-Path $destDir 'tightvnc-launch.ps1'
Copy-Item -Force -Path (Join-Path $PSScriptRoot 'tightvnc-launch.ps1') -Destination $script

$base = 'HKCU:\Software\Classes\tightvnc'
New-Item -Force -Path $base | Out-Null
Set-ItemProperty -Path $base -Name '(default)' -Value 'URL:TightVNC Protocol'
Set-ItemProperty -Path $base -Name 'URL Protocol' -Value ''
New-Item -Force -Path "$base\shell\open\command" | Out-Null
$cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" "%1"' -f $script
Set-ItemProperty -Path "$base\shell\open\command" -Name '(default)' -Value $cmd

Write-Host "Protocolo tightvnc:// registrado. Script en $script"
Write-Host "Prueba: Start-Process 'tightvnc://127.0.0.1:5900'"
