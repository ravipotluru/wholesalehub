# =============================================================================
# WholesaleHub Demo Reset Script (Windows PowerShell)
# =============================================================================
# This script tears down the entire development environment (Docker containers
# and volumes) and re-runs the full setup from scratch.
#
# Usage: .\scripts\reset-demo.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

# ─── Color helpers ───────────────────────────────────────────────────────────
function Write-Info    { param([string]$Message) Write-Host "[INFO]    " -ForegroundColor Blue -NoNewline; Write-Host $Message }
function Write-Success { param([string]$Message) Write-Host "[OK]      " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Warn    { param([string]$Message) Write-Host "[WARN]    " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-Err     { param([string]$Message) Write-Host "[ERROR]   " -ForegroundColor Red -NoNewline; Write-Host $Message }
function Write-Step    { param([string]$Message) Write-Host "`n>>> $Message" -ForegroundColor DarkYellow }
function Write-Divider { Write-Host ("-" * 70) -ForegroundColor DarkGray }

# ─── Change to project root ─────────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

# ─── Detect compose command ──────────────────────────────────────────────────
$ComposeCmd = $null
try {
    docker-compose version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ComposeCmd = "docker-compose" }
} catch {}

if (-not $ComposeCmd) {
    try {
        docker compose version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ComposeCmd = "docker compose" }
    } catch {}
}

if (-not $ComposeCmd) {
    Write-Err "docker-compose is not available."
    exit 1
}

# =============================================================================
# MAIN
# =============================================================================
Write-Host ""
Write-Host "  +==============================================================+" -ForegroundColor Red
Write-Host "  |               WholesaleHub - FULL RESET                      |" -ForegroundColor Red
Write-Host "  +==============================================================+" -ForegroundColor Red
Write-Host ""
Write-Host "  This will:" -ForegroundColor Yellow
Write-Host "    1. Stop all Docker containers"
Write-Host "    2. Remove Docker volumes (" -NoNewline
Write-Host "all database data will be lost" -ForegroundColor Red -NoNewline
Write-Host ")"
Write-Host "    3. Remove node_modules"
Write-Host "    4. Remove .next build cache"
Write-Host "    5. Re-run full setup from scratch"
Write-Host ""

# ─── Confirm ─────────────────────────────────────────────────────────────────
$confirm = Read-Host "Are you sure you want to reset everything? (y/N)"
if ($confirm -notmatch "^[Yy]$") {
    Write-Host "Reset cancelled." -ForegroundColor DarkGray
    exit 0
}

Write-Host ""

# ─── Step 1: Stop containers ────────────────────────────────────────────────
Write-Step "Step 1/5: Stopping Docker containers"

try {
    if ($ComposeCmd -eq "docker-compose") {
        docker-compose down 2>$null
    } else {
        docker compose down 2>$null
    }
} catch {
    Write-Warn "Some containers may not have been running."
}
Write-Success "Docker containers stopped"

# ─── Step 2: Remove volumes ─────────────────────────────────────────────────
Write-Step "Step 2/5: Removing Docker volumes"

try {
    if ($ComposeCmd -eq "docker-compose") {
        docker-compose down -v 2>$null
    } else {
        docker compose down -v 2>$null
    }
} catch {
    Write-Warn "Some volumes may not have existed."
}
Write-Success "Docker volumes removed"

# ─── Step 3: Clean build artifacts ───────────────────────────────────────────
Write-Step "Step 3/5: Cleaning build artifacts"

if (Test-Path "node_modules") {
    Write-Info "Removing node_modules..."
    Remove-Item -Recurse -Force "node_modules"
    Write-Success "node_modules removed"
} else {
    Write-Success "node_modules already clean"
}

if (Test-Path ".next") {
    Write-Info "Removing .next build cache..."
    Remove-Item -Recurse -Force ".next"
    Write-Success ".next removed"
} else {
    Write-Success ".next already clean"
}

# ─── Step 4: Remove generated migrations ────────────────────────────────────
Write-Step "Step 4/5: Cleaning Prisma migrations"

if (Test-Path "prisma\migrations") {
    Write-Info "Removing existing migrations directory..."
    Remove-Item -Recurse -Force "prisma\migrations"
    Write-Success "Migrations directory removed"
} else {
    Write-Success "No migrations directory found"
}

# ─── Step 5: Re-run setup ───────────────────────────────────────────────────
Write-Step "Step 5/5: Re-running full setup"

Write-Divider
Write-Host ""
Write-Host "  Environment cleaned. Starting fresh setup..." -ForegroundColor Green
Write-Host ""
Write-Divider

& "$ScriptDir\setup-demo.ps1"
