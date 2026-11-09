# PuestoMap - elimina el protocolo tightvnc:// del usuario actual
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue 'HKCU:\Software\Classes\tightvnc'
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $env:LOCALAPPDATA 'PuestoMap')
Write-Host "Protocolo tightvnc:// eliminado."
