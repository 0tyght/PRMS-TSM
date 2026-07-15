param(
    [switch]$SkipGitPush
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root ".runtime"
$configPath = Join-Path $root "runtime-config.json"
$apiHealthUrl = "http://127.0.0.1:4100/api/health"
$portalUrl = "https://0tyght.github.io/PRMS-TSM/"

function Get-ApiHealth {
    try {
        return Invoke-RestMethod `
            -Uri $apiHealthUrl `
            -Method Get `
            -TimeoutSec 3
    }
    catch {
        return $null
    }
}

function Test-ApiReady {
    param(
        $Health
    )

    return (
        $null -ne $Health -and
        $Health.status -eq "ok" -and
        $Health.database -eq "ready"
    )
}

function Get-PublicApiHealth {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseUrl
    )

    try {
        return Invoke-RestMethod `
            -Uri "$BaseUrl/api/health" `
            -Method Get `
            -TimeoutSec 10
    }
    catch {
        return $null
    }
}

function Get-CloudflaredPath {
    $candidates = @(
        (Join-Path $root ".tools\cloudflared.exe"),
        "C:\xampp\htdocs\postsales-iot\.tools\cloudflared.exe",
        "C:\cloudflared\cloudflared.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $command = Get-Command "cloudflared.exe" -ErrorAction SilentlyContinue

    if ($command) {
        return $command.Source
    }

    throw @"
cloudflared.exe was not found.

Place cloudflared.exe at:
$root\.tools\cloudflared.exe
"@
}

function Stop-PreviousTunnel {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PidPath
    )

    if (-not (Test-Path $PidPath)) {
        return
    }

    $pidText = Get-Content $PidPath -Raw -ErrorAction SilentlyContinue
    $oldPid = 0

    if (
        [string]::IsNullOrWhiteSpace($pidText) -or
        -not [int]::TryParse($pidText.Trim(), [ref]$oldPid)
    ) {
        Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
        return
    }

    $oldProcess = Get-CimInstance `
        -ClassName Win32_Process `
        -Filter "ProcessId=$oldPid" `
        -ErrorAction SilentlyContinue

    if (
        $oldProcess -and
        $oldProcess.CommandLine -like "*127.0.0.1:4100*"
    ) {
        Write-Host "Stopping previous Cloudflare Tunnel..." -ForegroundColor Yellow
        Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
    }

    Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
}

New-Item `
    -ItemType Directory `
    -Force `
    -Path $runtimeDir |
    Out-Null

Write-Host "Checking API and MySQL..." -ForegroundColor Cyan

$health = Get-ApiHealth

if (-not (Test-ApiReady -Health $health)) {
    if (
        $health -and
        $health.status -eq "ok" -and
        $health.database -ne "ready"
    ) {
        throw @"
The API is running, but MySQL is unavailable.

Please start MySQL in XAMPP and run this script again.
"@
    }

    $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue

    if (-not $nodeCommand) {
        throw "node.exe was not found. Please install Node.js or add it to PATH."
    }

    Write-Host "Starting API on port 4100..." -ForegroundColor Yellow

    Start-Process `
        -FilePath $nodeCommand.Source `
        -ArgumentList "apps/api/src/server.js" `
        -WorkingDirectory $root `
        -WindowStyle Hidden |
        Out-Null

    $apiDeadline = (Get-Date).AddSeconds(25)

    do {
        Start-Sleep -Milliseconds 500
        $health = Get-ApiHealth
    }
    while (
        -not (Test-ApiReady -Health $health) -and
        (Get-Date) -lt $apiDeadline
    )
}

if (-not (Test-ApiReady -Health $health)) {
    if ($health -and $health.database -ne "ready") {
        throw @"
MySQL is unavailable.

Please start MySQL in XAMPP and verify the .env database settings.
"@
    }

    throw "The API is not ready on port 4100."
}

Write-Host "API ready." -ForegroundColor Green
Write-Host "MySQL ready." -ForegroundColor Green

$cloudflared = Get-CloudflaredPath
$pidPath = Join-Path $runtimeDir "cloudflared.pid"

Stop-PreviousTunnel -PidPath $pidPath

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = Join-Path $runtimeDir "tunnel-$stamp.out.log"
$errLog = Join-Path $runtimeDir "tunnel-$stamp.err.log"

Write-Host "Starting Cloudflare Quick Tunnel..." -ForegroundColor Cyan

$tunnel = Start-Process `
    -FilePath $cloudflared `
    -ArgumentList @(
        "tunnel",
        "--url",
        "http://127.0.0.1:4100",
        "--no-autoupdate"
    ) `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

[IO.File]::WriteAllText(
    $pidPath,
    [string]$tunnel.Id,
    (New-Object Text.UTF8Encoding($false))
)

$tunnelUrl = $null
$tunnelDeadline = (Get-Date).AddSeconds(60)

while (
    -not $tunnelUrl -and
    (Get-Date) -lt $tunnelDeadline -and
    -not $tunnel.HasExited
) {
    Start-Sleep -Seconds 1

    $logParts = @()

    if (Test-Path $outLog) {
        $logParts += Get-Content $outLog -ErrorAction SilentlyContinue
    }

    if (Test-Path $errLog) {
        $logParts += Get-Content $errLog -ErrorAction SilentlyContinue
    }

    $logText = $logParts -join "`n"

    $match = [regex]::Match(
        $logText,
        "https://[a-z0-9-]+\.trycloudflare\.com"
    )

    if ($match.Success) {
        $tunnelUrl = $match.Value
    }
}

if (-not $tunnelUrl) {
    throw @"
Cloudflare did not return a Tunnel URL.

Check the latest log file inside:
$runtimeDir
"@
}

Write-Host "Tunnel URL: $tunnelUrl" -ForegroundColor Green
Write-Host "Checking public API..." -ForegroundColor Cyan

$publicHealth = $null
$publicDeadline = (Get-Date).AddSeconds(60)

do {
    $publicHealth = Get-PublicApiHealth -BaseUrl $tunnelUrl

    if (-not (Test-ApiReady -Health $publicHealth)) {
        Start-Sleep -Seconds 2
    }
}
while (
    -not (Test-ApiReady -Health $publicHealth) -and
    (Get-Date) -lt $publicDeadline
)

if (-not (Test-ApiReady -Health $publicHealth)) {
    throw @"
The Cloudflare Tunnel is online, but the public API or MySQL health check failed.
"@
}

$config = [ordered]@{
    apiBaseUrl = "$tunnelUrl/api"
    portalUrl  = $portalUrl
    updatedAt  = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json

[IO.File]::WriteAllText(
    $configPath,
    $config + [Environment]::NewLine,
    (New-Object Text.UTF8Encoding($false))
)

Write-Host "runtime-config.json updated." -ForegroundColor Green

if (-not $SkipGitPush) {
    Write-Host "Uploading the new Tunnel URL to GitHub..." -ForegroundColor Cyan

    & git -C $root add runtime-config.json

    if ($LASTEXITCODE -ne 0) {
        throw "git add failed."
    }

    & git -C $root diff --cached --quiet
    $diffExitCode = $LASTEXITCODE

    if ($diffExitCode -gt 1) {
        throw "git diff failed."
    }

    if ($diffExitCode -eq 1) {
        & git -C $root commit -m "chore: update temporary API tunnel"

        if ($LASTEXITCODE -ne 0) {
            throw "git commit failed."
        }

        & git -C $root push origin main

        if ($LASTEXITCODE -ne 0) {
            throw @"
git push failed.

Run:
git pull origin main --rebase
git push origin main
"@
        }

        Write-Host "New Tunnel URL pushed to GitHub." -ForegroundColor Green
    }
    else {
        Write-Host "runtime-config.json has not changed." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "PRMS-TSM is ready" -ForegroundColor Green
Write-Host "Admin: $portalUrl" -ForegroundColor Green
Write-Host "API:   $tunnelUrl/api" -ForegroundColor Green
Write-Host "DB:    ready" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green