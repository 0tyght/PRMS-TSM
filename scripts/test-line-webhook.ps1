param(
    [string]$ProjectPath = "C:\xampp\htdocs\PRMS-TSM",
    [int]$MaxAttempts = 15,
    [int]$DelaySeconds = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RepoRoot = (Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop).Path
$EnvPath = Join-Path $RepoRoot ".env"
$RuntimePath = Join-Path $RepoRoot "runtime-config.json"

if (-not (Test-Path -LiteralPath $EnvPath -PathType Leaf)) {
    throw "ไม่พบไฟล์ .env"
}

if (-not (Test-Path -LiteralPath $RuntimePath -PathType Leaf)) {
    throw "ไม่พบ runtime-config.json"
}

$SecretLine = Get-Content -LiteralPath $EnvPath |
    Where-Object {
        $_ -match '^\s*LINE_CHANNEL_SECRET\s*='
    } |
    Select-Object -Last 1

if (-not $SecretLine) {
    throw "ไม่พบ LINE_CHANNEL_SECRET ใน .env"
}

$Secret = (
    $SecretLine -replace '^\s*LINE_CHANNEL_SECRET\s*=', ''
).Trim().Trim('"').Trim("'")

if (-not $Secret) {
    throw "LINE_CHANNEL_SECRET ยังว่างอยู่"
}

$Runtime = Get-Content -LiteralPath $RuntimePath -Raw |
    ConvertFrom-Json

$ApiBaseUrl = ([string]$Runtime.apiBaseUrl).TrimEnd("/")

if (-not $ApiBaseUrl) {
    throw "ไม่พบ apiBaseUrl ใน runtime-config.json"
}

try {
    $ApiUri = [Uri]$ApiBaseUrl
} catch {
    throw "apiBaseUrl ไม่ถูกต้อง: $ApiBaseUrl"
}

$HostName = $ApiUri.Host
$HealthUrl = "$ApiBaseUrl/health"
$WebhookUrl = "$ApiBaseUrl/line/webhook"

Write-Host "กำลังรอ Cloudflare Tunnel พร้อมใช้งาน..."
Write-Host "Host: $HostName"
Write-Host "Health: $HealthUrl"

$Ready = $false
$LastError = ""

for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
    Write-Host ("ครั้งที่ {0}/{1}: " -f $Attempt, $MaxAttempts) -NoNewline

    $DnsReady = $false

    foreach ($DnsServer in @("1.1.1.1", "8.8.8.8")) {
        try {
            $null = Resolve-DnsName `
                -Name $HostName `
                -Server $DnsServer `
                -Type A `
                -ErrorAction Stop

            $DnsReady = $true
            break
        } catch {
            # ลอง DNS ตัวถัดไป
        }
    }

    if (-not $DnsReady) {
        $LastError = "DNS ยังไม่พบชื่อ Tunnel"
        Write-Host $LastError -ForegroundColor Yellow
        Start-Sleep -Seconds $DelaySeconds
        continue
    }

    try {
        $Health = Invoke-RestMethod `
            -Uri $HealthUrl `
            -Method Get `
            -TimeoutSec 20

        if ($Health.status -eq "ok" -or $Health.database -eq "ready") {
            $Ready = $true
            Write-Host "API พร้อมใช้งาน" -ForegroundColor Green
            break
        }

        $LastError = "API ตอบกลับ แต่สถานะยังไม่พร้อม"
        Write-Host $LastError -ForegroundColor Yellow
    } catch {
        $LastError = $_.Exception.Message
        Write-Host ("ยังเชื่อมต่อไม่ได้: {0}" -f $LastError) -ForegroundColor Yellow
    }

    Start-Sleep -Seconds $DelaySeconds
}

if (-not $Ready) {
    throw @"
Cloudflare Tunnel ยังไม่พร้อมหลังลอง $MaxAttempts ครั้ง

สาเหตุล่าสุด:
$LastError

ให้เปิด scripts\start-public.ps1 ค้างไว้ใน PowerShell อีกหน้าต่าง
ถ้า URL นี้ยัง resolve ไม่ได้ ให้หยุด cloudflared แล้วรัน start-public.ps1 ใหม่
"@
}

$Body = '{"destination":"LOCAL-VERIFY","events":[]}'
$Key = [System.Text.Encoding]::UTF8.GetBytes($Secret)
$Data = [System.Text.Encoding]::UTF8.GetBytes($Body)
$Hmac = [System.Security.Cryptography.HMACSHA256]::new($Key)

try {
    $Signature = [Convert]::ToBase64String(
        $Hmac.ComputeHash($Data)
    )
} finally {
    $Hmac.Dispose()
}

Write-Host ""
Write-Host "กำลังทดสอบ LINE Webhook..."
Write-Host "URL: $WebhookUrl"

$Response = Invoke-RestMethod `
    -Uri $WebhookUrl `
    -Method Post `
    -ContentType "application/json" `
    -Headers @{
        "x-line-signature" = $Signature
    } `
    -Body $Body `
    -TimeoutSec 20

Write-Host ""
Write-Host "Webhook พร้อมใช้งาน" -ForegroundColor Green
Write-Host "นำ URL นี้ไปใส่ใน LINE Developers:"
Write-Host $WebhookUrl -ForegroundColor Cyan
Write-Host ""
$Response | Format-List
