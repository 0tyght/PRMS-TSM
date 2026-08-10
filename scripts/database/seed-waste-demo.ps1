$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sqlFile = Join-Path $repoRoot "database\demo\waste_demo_data.sql"
$mysql = "C:\xampp\mysql\bin\mysql.exe"

if (-not (Test-Path -LiteralPath $mysql)) {
    throw "MySQL CLI was not found at $mysql"
}

if (-not (Test-Path -LiteralPath $sqlFile)) {
    throw "Waste demo SQL file was not found at $sqlFile"
}

& $mysql `
    "--default-character-set=utf8mb4" `
    "--host=127.0.0.1" `
    "--port=3306" `
    "--user=root" `
    "--database=prms_tsm" `
    "--execute=source $($sqlFile.Replace('\', '/'))"

if ($LASTEXITCODE -ne 0) {
    throw "Waste demo data import failed"
}

Write-Host "Waste demo data loaded successfully" -ForegroundColor Green
