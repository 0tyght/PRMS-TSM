[CmdletBinding()]
param(
    [string]$ProjectPath = "",
    [switch]$SkipGitPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $ProjectPath = (
        Resolve-Path (Join-Path $PSScriptRoot "..\..")
    ).Path
}

function Read-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $text = [System.IO.File]::ReadAllText($Path)
    $escapedName = [regex]::Escape($Name)
    $match = [regex]::Match(
        $text,
        "(?m)^[ \t]*$escapedName[ \t]*=[ \t]*([^\r\n]+)"
    )

    if (-not $match.Success) { return "" }
    $value = $match.Groups[1].Value.Trim()

    if (
        $value.Length -ge 2 -and
        (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        )
    ) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    return $value.Replace("`r", "").Replace("`n", "").Trim()
}

if (-not (Test-Path -LiteralPath $ProjectPath)) {
    throw "ไม่พบโฟลเดอร์โปรเจกต์: $ProjectPath"
}

$startPublicPath = Join-Path $ProjectPath "scripts\server\start-public.ps1"
if (-not (Test-Path -LiteralPath $startPublicPath)) {
    throw "ไม่พบ scripts\server\start-public.ps1"
}

Write-Host "Smart Tha Pho Start" -ForegroundColor Cyan
Write-Host "เปิด API, MySQL, Public Tunnel และอัปเดต LINE Webhook อัตโนมัติ"
Write-Host ""

$arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $startPublicPath
)
if ($SkipGitPush) { $arguments += "-SkipGitPush" }

& powershell @arguments
if ($LASTEXITCODE -ne 0) {
    throw "start-public.ps1 ไม่สำเร็จ (exit code: $LASTEXITCODE)"
}

$runtimeConfigPath = Join-Path $ProjectPath "runtime-config.json"
if (-not (Test-Path -LiteralPath $runtimeConfigPath)) {
    throw "ไม่พบ runtime-config.json หลังเปิดระบบ"
}

$config = Get-Content -LiteralPath $runtimeConfigPath -Raw | ConvertFrom-Json
$apiBaseUrl = [string]$config.apiBaseUrl
if ([string]::IsNullOrWhiteSpace($apiBaseUrl)) {
    throw "runtime-config.json ไม่มี apiBaseUrl"
}
$apiBaseUrl = $apiBaseUrl.TrimEnd("/")
$webhookUrl = "$apiBaseUrl/line/webhook"
$portalUrl = [string]$config.portalUrl
if ([string]::IsNullOrWhiteSpace($portalUrl)) {
    $portalUrl = "https://0tyght.github.io/PRMS-TSM/"
}

$healthReady = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $health = Invoke-RestMethod `
            -Method Get `
            -Uri "$apiBaseUrl/v1/health/live" `
            -Headers @{ "ngrok-skip-browser-warning" = "true" } `
            -TimeoutSec 10 `
            -ErrorAction Stop
        if ($health.status -eq "alive") {
            $healthReady = $true
            break
        }
    }
    catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $healthReady) {
    throw "Public API ยังไม่พร้อม: $apiBaseUrl"
}

$envPath = Join-Path $ProjectPath ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
    throw "ไม่พบ .env"
}
$token = Read-DotEnvValue -Path $envPath -Name "LINE_CHANNEL_ACCESS_TOKEN"
if ([string]::IsNullOrWhiteSpace($token)) {
    throw "LINE_CHANNEL_ACCESS_TOKEN ไม่มีค่า"
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$headers = @{ Authorization = "Bearer $token" }
$botInfo = Invoke-RestMethod `
    -Method Get `
    -Uri "https://api.line.me/v2/bot/info" `
    -Headers $headers `
    -TimeoutSec 20 `
    -ErrorAction Stop
$webhookInfo = Invoke-RestMethod `
    -Method Get `
    -Uri "https://api.line.me/v2/bot/channel/webhook/endpoint" `
    -Headers $headers `
    -TimeoutSec 20 `
    -ErrorAction Stop

if ([string]$webhookInfo.endpoint -ne $webhookUrl) {
    Write-Host "อัปเดต LINE Webhook เป็น URL ใหม่..." -ForegroundColor Yellow
    $body = @{ endpoint = $webhookUrl } | ConvertTo-Json -Compress
    Invoke-RestMethod `
        -Method Put `
        -Uri "https://api.line.me/v2/bot/channel/webhook/endpoint" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 20 `
        -ErrorAction Stop | Out-Null
}

$deadline = (Get-Date).AddSeconds(70)
do {
    Start-Sleep -Seconds 3
    $webhookInfo = Invoke-RestMethod `
        -Method Get `
        -Uri "https://api.line.me/v2/bot/channel/webhook/endpoint" `
        -Headers $headers `
        -TimeoutSec 20 `
        -ErrorAction Stop
} while ([string]$webhookInfo.endpoint -ne $webhookUrl -and (Get-Date) -lt $deadline)

if ([string]$webhookInfo.endpoint -ne $webhookUrl) {
    throw "LINE Webhook ยังไม่ตรงกับ URL ใหม่"
}
if (-not [bool]$webhookInfo.active) {
    throw "Use webhook ยังปิดอยู่ใน LINE Developers"
}

$testResult = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.line.me/v2/bot/channel/webhook/test" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{ endpoint = $webhookUrl } | ConvertTo-Json -Compress) `
    -TimeoutSec 30 `
    -ErrorAction Stop

if (-not [bool]$testResult.success) {
    throw "LINE Webhook test ไม่ผ่าน: $($testResult.reason)"
}

Write-Host ""
Write-Host "Smart Tha Pho พร้อมใช้งาน" -ForegroundColor Green
Write-Host "Bot: $($botInfo.displayName) ($($botInfo.basicId))" -ForegroundColor Green
Write-Host "Web: $portalUrl" -ForegroundColor Green
Write-Host "API: $apiBaseUrl" -ForegroundColor Green
Write-Host "Webhook: $webhookUrl" -ForegroundColor Green
Write-Host "Rich Menu: V12 cache + instant alias switch" -ForegroundColor Green
