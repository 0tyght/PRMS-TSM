[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$projectPath = $PSScriptRoot
$launcherPath = Join-Path $projectPath "scripts\start-smart-tha-pho.ps1"

if (-not (Test-Path -LiteralPath $launcherPath)) {
    throw "scripts\\start-smart-tha-pho.ps1 was not found."
}

Write-Host "Smart Tha Pho: starting API, MySQL, Cloudflare Tunnel and LINE webhook update..." -ForegroundColor Cyan

& $launcherPath -ProjectPath $projectPath
exit $LASTEXITCODE
