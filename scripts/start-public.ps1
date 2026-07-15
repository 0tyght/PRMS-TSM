param([switch]$SkipGitPush)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root ".runtime"
$configPath = Join-Path $root "runtime-config.json"
$cloudflared = Join-Path $root ".tools\cloudflared.exe"
if (-not (Test-Path $cloudflared)) { $cloudflared = "C:\xampp\htdocs\postsales-iot\.tools\cloudflared.exe" }
if (-not (Test-Path $cloudflared)) { throw "cloudflared.exe was not found" }
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

try { $health = Invoke-RestMethod "http://127.0.0.1:4100/api/health" -TimeoutSec 3 } catch { $health = $null }
if (-not $health -or $health.status -ne "ok") {
  Start-Process -FilePath "node.exe" -ArgumentList "apps/api/src/server.js" -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 400
    try { $health = Invoke-RestMethod "http://127.0.0.1:4100/api/health" -TimeoutSec 2 } catch {}
  } while ($health.status -ne "ok" -and (Get-Date) -lt $deadline)
}
if ($health.status -ne "ok") { throw "API is not ready on port 4100" }

$pidPath = Join-Path $runtimeDir "cloudflared.pid"
if (Test-Path $pidPath) {
  $oldPid = [int](Get-Content $pidPath -ErrorAction SilentlyContinue)
  $old = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
  if ($old -and $old.CommandLine -like "*127.0.0.1:4100*") { Stop-Process -Id $oldPid -Force }
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = Join-Path $runtimeDir "tunnel-$stamp.out.log"
$errLog = Join-Path $runtimeDir "tunnel-$stamp.err.log"
$tunnel = Start-Process -FilePath $cloudflared -ArgumentList "tunnel","--url","http://127.0.0.1:4100","--no-autoupdate" -WorkingDirectory $root -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
[IO.File]::WriteAllText($pidPath, [string]$tunnel.Id)

$url = $null
$deadline = (Get-Date).AddSeconds(50)
while (-not $url -and (Get-Date) -lt $deadline -and -not $tunnel.HasExited) {
  Start-Sleep -Seconds 1
  $text = ((Get-Content $outLog,$errLog -ErrorAction SilentlyContinue) -join "`n")
  $match = [regex]::Match($text, "https://[a-z0-9-]+\.trycloudflare\.com")
  if ($match.Success) { $url = $match.Value }
}
if (-not $url) { throw "Cloudflare did not return a Tunnel URL" }

$publicHealth = $null
$deadline = (Get-Date).AddSeconds(60)
do {
  try { $publicHealth = Invoke-RestMethod "$url/api/health" -TimeoutSec 10 } catch { Start-Sleep -Seconds 2 }
} while ($publicHealth.status -ne "ok" -and (Get-Date) -lt $deadline)
if ($publicHealth.status -ne "ok") { throw "Tunnel is online but the public API health check failed" }

$config = [ordered]@{
  apiBaseUrl = "$url/api"
  portalUrl = "https://0tyght.github.io/PRMS-TSM/"
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json
[IO.File]::WriteAllText($configPath, $config + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))

if (-not $SkipGitPush) {
  git -C $root add runtime-config.json
  git -C $root diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    git -C $root commit -m "chore: update temporary API tunnel"
    git -C $root push origin main
  }
}
Write-Host "Admin: https://0tyght.github.io/PRMS-TSM/" -ForegroundColor Green
Write-Host "API:   $url/api" -ForegroundColor Green
