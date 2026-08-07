param(
    [string]$ProjectPath = "C:\xampp\htdocs\PRMS-TSM"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$exitCode = 1
Push-Location $ProjectPath
try {
    & node "scripts\sync-line-rich-menus.mjs"
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

exit $exitCode
