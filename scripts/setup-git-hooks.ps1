$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
git -C $repoRoot config core.hooksPath .githooks
Write-Host "Configured core.hooksPath=.githooks for $repoRoot"
