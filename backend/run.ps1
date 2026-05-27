# Dev launcher for the FastAPI backend.
# Usage: from project root run    .\backend\run.ps1
#
# Activates ..\.venv if present, otherwise uses the system python.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$venv = Join-Path $repoRoot ".venv\Scripts\Activate.ps1"
if (Test-Path $venv) {
    Write-Host "Activating venv: $venv"
    . $venv
}

Set-Location $scriptDir
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
