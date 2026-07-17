param(
    [switch]$SkipGitPush
)

$ErrorActionPreference = "Stop"

function Test-HealthReady {
    param(
        [object]$Health
    )

    return (
        $null -ne $Health -and
        [string]$Health.status -eq "ok" -and
        [string]$Health.database -eq "ready"
    )
}

function Get-LocalHealth {
    try {
        return Invoke-RestMethod `
            -Uri "http://127.0.0.1:4100/api/health" `
            -TimeoutSec 3 `
            -Headers @{
                "Cache-Control" = "no-cache"
            }
    }
    catch {
        return $null
    }
}

function Get-PublicHealth {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TunnelUrl
    )

    $baseUrl = $TunnelUrl.TrimEnd("/")
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

    $healthUrl = "{0}/api/health?ts={1}" -f `
        $baseUrl,
        $timestamp

    # ลองใช้ DNS ปกติของ Windows ก่อน
    # ไม่มีการแก้ไข DNS หรือ Network Adapter
    try {
        return Invoke-RestMethod `
            -Uri $healthUrl `
            -TimeoutSec 15 `
            -Headers @{
                "Cache-Control" = "no-cache"
                "Pragma" = "no-cache"
                "User-Agent" = "PRMS-TSM-Health-Check"
            }
    }
    catch {
        $normalResolverError = $_.Exception.Message
    }

    # หาก DNS ของเครื่องยังหา Quick Tunnel ไม่เจอ
    # ให้ถาม Public DNS เฉพาะชื่อโดเมนนี้เท่านั้น
    $tunnelHost = ([Uri]$baseUrl).DnsSafeHost
    $addresses = @()
    $publicDnsErrors = @()

    foreach ($dnsServer in @("1.1.1.1", "8.8.8.8")) {
        try {
            $resolvedAddresses = @(
                Resolve-DnsName `
                    -Name $tunnelHost `
                    -Server $dnsServer `
                    -Type A `
                    -DnsOnly `
                    -ErrorAction Stop |
                Where-Object {
                    $null -ne $_.IPAddress
                } |
                Select-Object `
                    -ExpandProperty IPAddress `
                    -Unique
            )

            if ($resolvedAddresses.Count -gt 0) {
                $addresses = $resolvedAddresses
                break
            }
        }
        catch {
            $publicDnsErrors += (
                "{0}: {1}" -f `
                    $dnsServer,
                    $_.Exception.Message
            )
        }
    }

    if ($addresses.Count -eq 0) {
        $dnsErrorText = $publicDnsErrors -join " | "

        throw (
            "Tunnel DNS resolution failed. " +
            "Windows resolver: {0}. Public DNS: {1}" -f `
                $normalResolverError,
                $dnsErrorText
        )
    }

    $lastCurlError = ""

    foreach ($address in $addresses) {
        $resolveValue = "{0}:443:{1}" -f `
            $tunnelHost,
            $address

        $curlOutput = & curl.exe `
            --silent `
            --show-error `
            --fail `
            --max-time 20 `
            --resolve $resolveValue `
            --header "Cache-Control: no-cache" `
            --header "Pragma: no-cache" `
            $healthUrl 2>&1

        $curlExitCode = $LASTEXITCODE

        $responseText = (
            $curlOutput -join [Environment]::NewLine
        )

        if ($curlExitCode -ne 0) {
            $lastCurlError = (
                "{0} returned curl exit code {1}: {2}" -f `
                    $address,
                    $curlExitCode,
                    $responseText
            )

            continue
        }

        try {
            return (
                $responseText |
                ConvertFrom-Json
            )
        }
        catch {
            $lastCurlError = (
                "{0} returned invalid JSON: {1}" -f `
                    $address,
                    $responseText
            )
        }
    }

    throw (
        "Tunnel health check failed: {0}" -f `
            $lastCurlError
    )
}

$root = (
    Resolve-Path (
        Join-Path $PSScriptRoot ".."
    )
).Path

$runtimeDir = Join-Path $root ".runtime"

$configPath = Join-Path `
    $root `
    "runtime-config.json"

$cloudflaredPath = Join-Path `
    $root `
    ".tools\cloudflared.exe"

if (-not (Test-Path $cloudflaredPath)) {
    $cloudflaredPath = (
        "C:\xampp\htdocs\postsales-iot\" +
        ".tools\cloudflared.exe"
    )
}

if (-not (Test-Path $cloudflaredPath)) {
    throw "cloudflared.exe was not found."
}

New-Item `
    -ItemType Directory `
    -Force `
    -Path $runtimeDir |
Out-Null

Write-Host `
    "Checking API and MySQL..." `
    -ForegroundColor Cyan

$localHealth = Get-LocalHealth

if (-not (Test-HealthReady $localHealth)) {
    if ($null -eq $localHealth) {
        Start-Process `
            -FilePath "node.exe" `
            -ArgumentList @(
                "apps/api/src/server.js"
            ) `
            -WorkingDirectory $root `
            -WindowStyle Hidden |
        Out-Null
    }

    $localDeadline = (Get-Date).AddSeconds(30)

    do {
        Start-Sleep -Milliseconds 500
        $localHealth = Get-LocalHealth
    }
    while (
        -not (Test-HealthReady $localHealth) -and
        (Get-Date) -lt $localDeadline
    )
}

if (-not (Test-HealthReady $localHealth)) {
    $localStatus = if ($null -ne $localHealth) {
        [string]$localHealth.status
    }
    else {
        "unavailable"
    }

    $databaseStatus = if ($null -ne $localHealth) {
        [string]$localHealth.database
    }
    else {
        "unavailable"
    }

    throw (
        "Local API or MySQL is not ready. " +
        "status={0}, database={1}" -f `
            $localStatus,
            $databaseStatus
    )
}

Write-Host `
    "API ready." `
    -ForegroundColor Green

Write-Host `
    "MySQL ready." `
    -ForegroundColor Green

$pidPath = Join-Path `
    $runtimeDir `
    "cloudflared.pid"

if (Test-Path $pidPath) {
    $oldPidText = Get-Content `
        $pidPath `
        -ErrorAction SilentlyContinue

    $oldPid = 0

    if (
        [int]::TryParse(
            [string]$oldPidText,
            [ref]$oldPid
        )
    ) {
        $oldProcess = Get-CimInstance `
            Win32_Process `
            -Filter (
                "ProcessId={0}" -f $oldPid
            ) `
            -ErrorAction SilentlyContinue

        if (
            $null -ne $oldProcess -and
            [string]$oldProcess.CommandLine -like `
                "*127.0.0.1:4100*"
        ) {
            Write-Host `
                "Stopping previous Cloudflare Tunnel..." `
                -ForegroundColor Yellow

            Stop-Process `
                -Id $oldPid `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }
}

$tunnelUrl = $null
$tunnelProcess = $null
$outLog = $null
$errLog = $null
$tunnelStartErrors = @()
$maxTunnelStartAttempts = 6

for (
    $tunnelStartAttempt = 1;
    $tunnelStartAttempt -le $maxTunnelStartAttempts;
    $tunnelStartAttempt += 1
) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $logSuffix = "{0}-{1}" -f $stamp, $tunnelStartAttempt
    $outLog = Join-Path $runtimeDir ("tunnel-{0}.out.log" -f $logSuffix)
    $errLog = Join-Path $runtimeDir ("tunnel-{0}.err.log" -f $logSuffix)

    Write-Host `
        ("Starting Cloudflare Quick Tunnel (attempt {0}/{1})..." -f `
            $tunnelStartAttempt,
            $maxTunnelStartAttempts) `
        -ForegroundColor Cyan

    $tunnelProcess = Start-Process `
        -FilePath $cloudflaredPath `
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
        [string]$tunnelProcess.Id
    )

    $urlDeadline = (Get-Date).AddSeconds(45)

    while (
        $null -eq $tunnelUrl -and
        (Get-Date) -lt $urlDeadline -and
        -not $tunnelProcess.HasExited
    ) {
        Start-Sleep -Seconds 1

        $logLines = @()

        if (Test-Path $outLog) {
            $logLines += Get-Content $outLog -ErrorAction SilentlyContinue
        }

        if (Test-Path $errLog) {
            $logLines += Get-Content $errLog -ErrorAction SilentlyContinue
        }

        $urlMatch = [regex]::Match(
            ($logLines -join [Environment]::NewLine),
            "https://[a-z0-9-]+\.trycloudflare\.com"
        )

        if ($urlMatch.Success) {
            $tunnelUrl = $urlMatch.Value
        }
    }

    if ($null -ne $tunnelUrl) {
        break
    }

    $tunnelLogTail = if (Test-Path $errLog) {
        (Get-Content $errLog -Tail 20 | Out-String).Trim()
    }
    else {
        "No Cloudflare error log was created."
    }

    $tunnelStartErrors += (
        "Attempt {0}: {1}" -f $tunnelStartAttempt, $tunnelLogTail
    )

    if ($null -ne $tunnelProcess -and -not $tunnelProcess.HasExited) {
        Stop-Process `
            -Id $tunnelProcess.Id `
            -Force `
            -ErrorAction SilentlyContinue
    }

    if ($tunnelStartAttempt -lt $maxTunnelStartAttempts) {
        Write-Host `
            "Cloudflare did not issue a URL; retrying in 6 seconds..." `
            -ForegroundColor Yellow
        Start-Sleep -Seconds 6
    }
}

if ($null -eq $tunnelUrl) {
    throw (
        "Cloudflare did not return a Tunnel URL after {0} attempts. {1}" -f `
            $maxTunnelStartAttempts,
            ($tunnelStartErrors -join [Environment]::NewLine)
    )
}

Write-Host `
    ("Tunnel URL: {0}" -f $tunnelUrl) `
    -ForegroundColor Green

Write-Host `
    "Checking public API..." `
    -ForegroundColor Cyan

$publicHealth = $null
$lastPublicError = ""
$attempt = 0
$publicDeadline = (Get-Date).AddSeconds(150)

do {
    $attempt += 1

    if ($tunnelProcess.HasExited) {
        throw (
            "Cloudflare Tunnel stopped unexpectedly. " +
            "Exit code: {0}" -f `
                $tunnelProcess.ExitCode
        )
    }

    try {
        $publicHealth = Get-PublicHealth `
            -TunnelUrl $tunnelUrl

        if (Test-HealthReady $publicHealth) {
            Write-Host `
                (
                    "Public API and MySQL ready " +
                    "after {0} attempt(s)." -f `
                        $attempt
                ) `
                -ForegroundColor Green

            break
        }

        $lastPublicError = (
            "status={0}, database={1}" -f `
                [string]$publicHealth.status,
                [string]$publicHealth.database
        )
    }
    catch {
        $publicHealth = $null
        $lastPublicError = $_.Exception.Message
    }

    Write-Host `
        (
            "Public health attempt {0} failed: {1}" -f `
                $attempt,
                $lastPublicError
        ) `
        -ForegroundColor Yellow

    Start-Sleep -Seconds 3
}
while (
    -not (Test-HealthReady $publicHealth) -and
    (Get-Date) -lt $publicDeadline
)

if (-not (Test-HealthReady $publicHealth)) {
    $tunnelLogTail = ""

    if (Test-Path $errLog) {
        $tunnelLogTail = (
            Get-Content `
                $errLog `
                -Tail 40 |
            Out-String
        )
    }

    throw (
        "Cloudflare Tunnel health check failed. " +
        "URL={0}; Error={1}; Log={2}" -f `
            $tunnelUrl,
            $lastPublicError,
            $tunnelLogTail
    )
}

$configJson = [ordered]@{
    apiBaseUrl = "{0}/api" -f $tunnelUrl
    portalUrl = "https://0tyght.github.io/PRMS-TSM/"
    updatedAt = (
        Get-Date
    ).ToUniversalTime().ToString("o")
} |
ConvertTo-Json

[IO.File]::WriteAllText(
    $configPath,
    $configJson + [Environment]::NewLine,
    (
        New-Object Text.UTF8Encoding($false)
    )
)

if (-not $SkipGitPush) {
    & git -C $root add runtime-config.json

    if ($LASTEXITCODE -ne 0) {
        throw "git add failed."
    }

    & git -C $root diff --cached --quiet -- runtime-config.json
    $diffExitCode = $LASTEXITCODE

    if ($diffExitCode -eq 1) {
        & git -C $root commit -m "อัปเดต URL API ชั่วคราว" -- runtime-config.json

        if ($LASTEXITCODE -ne 0) {
            throw "git commit failed."
        }

        & git -C $root push origin main

        if ($LASTEXITCODE -ne 0) {
            throw "git push failed."
        }
    }
    elseif ($diffExitCode -ne 0) {
        throw "git diff failed."
    }
}

Write-Host ""
Write-Host "PRMS-TSM is ready." -ForegroundColor Green
Write-Host "Admin: https://0tyght.github.io/PRMS-TSM/" -ForegroundColor Green
Write-Host ("API: {0}/api" -f $tunnelUrl) -ForegroundColor Green
