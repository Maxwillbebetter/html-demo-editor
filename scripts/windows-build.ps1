$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Require-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. $InstallHint"
  }
}

Write-Host ""
Write-Host "HTML Demo Editor - Windows build" -ForegroundColor Cyan
Write-Host "Project: $root"
Write-Host ""

Require-Command "node" "Install Node.js 22 LTS from https://nodejs.org/"
Require-Command "npm" "Install Node.js 22 LTS from https://nodejs.org/"

$nodeVersion = (& node -v).Trim()
$nodeMajor = [int]($nodeVersion.TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) {
  throw "Node.js 20 or newer is required. Current version: $nodeVersion"
}

Write-Host "Node: $nodeVersion"
Write-Host "npm:  $((& npm -v).Trim())"
Write-Host ""

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host ""
Write-Host "Building installer and portable exe..." -ForegroundColor Yellow
npm run dist:win

$releaseDir = Join-Path $root "release"
Write-Host ""
Write-Host "Build finished. Windows files are in: $releaseDir" -ForegroundColor Green

if (Test-Path $releaseDir) {
  Get-ChildItem $releaseDir -Filter "*.exe" |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object {
      $sizeMb = [math]::Round($_.Length / 1MB, 1)
      Write-Host ("- {0} ({1} MB)" -f $_.Name, $sizeMb)
    }
}
