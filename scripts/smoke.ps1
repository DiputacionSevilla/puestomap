param(
    [string]$AppUrl = $(if ($env:APP_URL) { $env:APP_URL } else { "http://localhost:3100" }),
    [string]$GatewayUrl = $(if ($env:GATEWAY_HEALTH_URL) { $env:GATEWAY_HEALTH_URL } else { "http://localhost:8181/health" })
)

$ErrorActionPreference = "Stop"

function Test-Health([string]$Name, [string]$Url, [switch]$CheckDb) {
    $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 10
    if ($response.status -ne "ok" -or ($CheckDb -and $response.db -ne "ok")) {
        throw "$Name no esta sano: $($response | ConvertTo-Json -Compress)"
    }
    Write-Host "[smoke] $Name OK ($Url)"
}

Test-Health -Name "web" -Url "$($AppUrl.TrimEnd('/'))/api/health" -CheckDb
Test-Health -Name "gateway" -Url $GatewayUrl
