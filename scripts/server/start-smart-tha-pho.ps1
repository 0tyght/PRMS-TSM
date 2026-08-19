[CmdletBinding()]
param(
    [string]$ProjectPath = "",
    [switch]$SkipGitPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

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

$lineWebhookSync = Join-Path $ProjectPath "scripts\server\sync-line-webhooks.mjs"
if (Test-Path -LiteralPath $lineWebhookSync) {
    Write-Host "ซิงก์ LINE Webhook จากค่าที่บันทึกในระบบ..." -ForegroundColor Cyan
    try {
        & node $lineWebhookSync $apiBaseUrl
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "ซิงก์ LINE Webhook ไม่สำเร็จ แต่ระบบเว็บยังเปิดเพื่อให้แก้การตั้งค่าได้"
        }
    }
    catch {
        Write-Warning "ซิงก์ LINE Webhook ไม่สำเร็จ: $($_.Exception.Message)"
    }
}

$lineRichMenuDefaultSync = Join-Path $ProjectPath "scripts\server\sync-line-rich-menu-default.mjs"
if (Test-Path -LiteralPath $lineRichMenuDefaultSync) {
    Write-Host "ซิงก์ Default Rich Menu ของ Citizen OA เป็น Smart Tha Pho..." -ForegroundColor Cyan
    try {
        & node $lineRichMenuDefaultSync
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "ซิงก์ Default Rich Menu ไม่สำเร็จ แต่ API และ Webhook ยังพร้อมใช้งาน"
        }
    }
    catch {
        Write-Warning "ซิงก์ Default Rich Menu ไม่สำเร็จ: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "Smart Tha Pho พร้อมใช้งาน" -ForegroundColor Green
Write-Host "Web: $portalUrl" -ForegroundColor Green
Write-Host "API: $apiBaseUrl" -ForegroundColor Green
Write-Host "LINE OA: จัดการจากเมนู ตั้งค่า LINE OA ในระบบเว็บ" -ForegroundColor Green
Write-Host "Citizen webhook: /api/line/webhook" -ForegroundColor Green
Write-Host "Driver webhook: /api/line/driver-webhook" -ForegroundColor Green
