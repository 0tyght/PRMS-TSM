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
                "User-Agent" = "Smart-Tha-Pho-Health-Check"
                "ngrok-skip-browser-warning" = "true"
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
            --header "ngrok-skip-browser-warning: true" `
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

function Get-DotEnvValue {
    param([string]$Path, [string]$Name, [string]$Fallback = "")
    if (-not (Test-Path $Path)) { return $Fallback }
    $line = Get-Content $Path | Where-Object { $_ -match ("^\s*{0}\s*=" -f [regex]::Escape($Name)) } | Select-Object -Last 1
    if ($null -eq $line) { return $Fallback }
    $value = ($line -split "=", 2)[1].Trim()
    return $value.Trim('"').Trim("'")
}

function Invoke-DatabaseMigrations {
    param([Parameter(Mandatory = $true)][string]$Root)
    $mysql = "C:\xampp\mysql\bin\mysql.exe"
    if (-not (Test-Path $mysql)) { throw "mysql.exe was not found at C:\xampp\mysql\bin\mysql.exe" }
    $envPath = Join-Path $Root "server\.env"
    if (-not (Test-Path $envPath)) { $envPath = Join-Path $Root ".env" }
    $hostName = Get-DotEnvValue $envPath "DB_HOST" "127.0.0.1"
    $port = Get-DotEnvValue $envPath "DB_PORT" "3306"
    $user = Get-DotEnvValue $envPath "DB_USER" "root"
    $password = Get-DotEnvValue $envPath "DB_PASSWORD" ""
    $database = Get-DotEnvValue $envPath "DB_NAME" "prms_tsm"
    $previousPassword = $env:MYSQL_PWD
    try {
        $env:MYSQL_PWD = $password
        foreach ($migration in Get-ChildItem (Join-Path $Root "database\migrations") -Filter "*.sql" | Sort-Object Name) {
            $sourcePath = $migration.FullName.Replace("\", "/")
            & $mysql "--default-character-set=utf8mb4" "--host=$hostName" "--port=$port" "--user=$user" "--database=$database" "--execute=source $sourcePath"
            if ($LASTEXITCODE -ne 0) { throw ("Database migration failed: {0}" -f $migration.Name) }
        }
    }
    finally {
        $env:MYSQL_PWD = $previousPassword
    }
}

$root = (
    Resolve-Path (
        Join-Path $PSScriptRoot "..\\.."
    )
).Path

$runtimeDir = Join-Path $root ".runtime"

$configPath = Join-Path `
    $root `
    "runtime-config.json"

$ngrokCommand = Get-Command ngrok.exe -ErrorAction SilentlyContinue
if ($null -eq $ngrokCommand) {
    throw "ngrok.exe was not found. Install ngrok and configure its authtoken first."
}
$ngrokPath = $ngrokCommand.Source

New-Item `
    -ItemType Directory `
    -Force `
    -Path $runtimeDir |
Out-Null

Write-Host `
    "Checking API and MySQL..." `
    -ForegroundColor Cyan

Invoke-DatabaseMigrations -Root $root
Write-Host "Database migrations ready." -ForegroundColor Green

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

$legacyPidPath = Join-Path $runtimeDir "cloudflared.pid"
if (Test-Path $legacyPidPath) {
    $legacyPid = 0
    if ([int]::TryParse([string](Get-Content $legacyPidPath -ErrorAction SilentlyContinue), [ref]$legacyPid)) {
        $legacyProcess = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $legacyPid) -ErrorAction SilentlyContinue
        if ($null -ne $legacyProcess -and [string]$legacyProcess.CommandLine -like "*127.0.0.1:4100*") {
            Stop-Process -Id $legacyPid -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item $legacyPidPath -Force -ErrorAction SilentlyContinue
}

$pidPath = Join-Path $runtimeDir "ngrok.pid"

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
            Write-Host "Stopping previous Public Tunnel..." -ForegroundColor Yellow

            Stop-Process `
                -Id $oldPid `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }
}

$tunnelUrl = $null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = Join-Path $runtimeDir ("ngrok-{0}.out.log" -f $stamp)
$errLog = Join-Path $runtimeDir ("ngrok-{0}.err.log" -f $stamp)

Write-Host "Starting ngrok Public Tunnel..." -ForegroundColor Cyan
$tunnelProcess = Start-Process `
    -FilePath $ngrokPath `
    -ArgumentList @(
        "http",
        "http://127.0.0.1:4100",
        "--log",
        "stdout",
        "--log-format",
        "json"
    ) `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

[IO.File]::WriteAllText($pidPath, [string]$tunnelProcess.Id)
$urlDeadline = (Get-Date).AddSeconds(45)

do {
    Start-Sleep -Milliseconds 500
    try {
        $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
        $tunnelUrl = [string](
            $tunnels.tunnels |
            Where-Object { [string]$_.config.addr -eq "http://127.0.0.1:4100" -and [string]$_.proto -eq "https" } |
            Select-Object -First 1 -ExpandProperty public_url
        )
    }
    catch {
        $tunnelUrl = $null
    }
}
while (
    [string]::IsNullOrWhiteSpace($tunnelUrl) -and
    (Get-Date) -lt $urlDeadline -and
    -not $tunnelProcess.HasExited
)

if ([string]::IsNullOrWhiteSpace($tunnelUrl)) {
    $tunnelLogTail = (Get-Content $outLog -Tail 30 -ErrorAction SilentlyContinue | Out-String).Trim()
    throw "ngrok did not return a Public Tunnel URL. Log: $tunnelLogTail"
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
            "Public Tunnel stopped unexpectedly. " +
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
        "Public Tunnel health check failed. " +
        "URL={0}; Error={1}; Log={2}" -f `
            $tunnelUrl,
            $lastPublicError,
            $tunnelLogTail
    )
}

$configJson = [ordered]@{
    apiBaseUrl = "{0}/api" -f $tunnelUrl
    portalApiBaseUrl = "http://127.0.0.1:4100/api"
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
Write-Host "Smart Tha Pho is ready." -ForegroundColor Green
Write-Host "Platform: https://0tyght.github.io/PRMS-TSM/" -ForegroundColor Green
Write-Host ("API: {0}/api" -f $tunnelUrl) -ForegroundColor Green
