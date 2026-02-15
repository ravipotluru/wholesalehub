# =============================================================================
# WholesaleHub Demo Setup Script (Windows PowerShell)
# =============================================================================
# This script sets up a complete local development environment for WholesaleHub.
# It checks prerequisites, starts Docker services, runs migrations, seeds the
# database, and launches the dev server.
#
# Usage: .\scripts\setup-demo.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

# ─── Color helpers ───────────────────────────────────────────────────────────
function Write-Info    { param([string]$Message) Write-Host "[INFO]    " -ForegroundColor Blue -NoNewline; Write-Host $Message }
function Write-Success { param([string]$Message) Write-Host "[OK]      " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Warn    { param([string]$Message) Write-Host "[WARN]    " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-Err     { param([string]$Message) Write-Host "[ERROR]   " -ForegroundColor Red -NoNewline; Write-Host $Message }
function Write-Step    { param([string]$Message) Write-Host "`n>>> $Message" -ForegroundColor DarkYellow }
function Write-Divider { Write-Host ("-" * 70) -ForegroundColor DarkGray }

function Exit-WithError {
    param([string]$Message)
    Write-Err $Message
    Write-Host "Setup failed. Fix the issue above and re-run this script." -ForegroundColor Red
    exit 1
}

# ─── Banner ──────────────────────────────────────────────────────────────────
function Write-Banner {
    Write-Host ""
    Write-Host "  +==============================================================+" -ForegroundColor DarkCyan
    Write-Host "  |                                                              |" -ForegroundColor DarkCyan
    Write-Host "  |   WW     WW HH   HH  OOOOO  LL      EEEEE  SSSSS           |" -ForegroundColor DarkCyan
    Write-Host "  |   WW  W  WW HH   HH OO   OO LL      EE     SS              |" -ForegroundColor DarkCyan
    Write-Host "  |   WW W W WW HHHHHHH OO   OO LL      EEEE    SSSS           |" -ForegroundColor DarkCyan
    Write-Host "  |   WWWW WWWW HH   HH OO   OO LL      EE         SS          |" -ForegroundColor DarkCyan
    Write-Host "  |    WW   WW  HH   HH  OOOOO  LLLLLL EEEEE  SSSSS           |" -ForegroundColor DarkCyan
    Write-Host "  |                         SALE                                |" -ForegroundColor DarkCyan
    Write-Host "  |              HH   HH UU   UU BBBBB                         |" -ForegroundColor DarkCyan
    Write-Host "  |              HH   HH UU   UU BB  BB                        |" -ForegroundColor DarkCyan
    Write-Host "  |              HHHHHHH UU   UU BBBBB                         |" -ForegroundColor DarkCyan
    Write-Host "  |              HH   HH UU   UU BB  BB                        |" -ForegroundColor DarkCyan
    Write-Host "  |              HH   HH  UUUUU  BBBBB                         |" -ForegroundColor DarkCyan
    Write-Host "  |                                                              |" -ForegroundColor DarkCyan
    Write-Host "  |          B2B Wholesale Marketplace Platform                  |" -ForegroundColor DarkCyan
    Write-Host "  +==============================================================+" -ForegroundColor DarkCyan
    Write-Host ""
}

# ─── Success banner ──────────────────────────────────────────────────────────
function Write-SuccessBanner {
    Write-Host ""
    Write-Divider
    Write-Host ""
    Write-Host "  +==============================================================+" -ForegroundColor Green
    Write-Host "  |              WholesaleHub is running!                         |" -ForegroundColor Green
    Write-Host "  +==============================================================+" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Application URL:  " -ForegroundColor Cyan -NoNewline
    Write-Host "http://localhost:3000" -ForegroundColor White
    Write-Host "  Prisma Studio:    " -ForegroundColor Cyan -NoNewline
    Write-Host "Run 'npm run db:studio' in another terminal" -ForegroundColor DarkGray
    Write-Host ""
    Write-Divider
    Write-Host ""
    Write-Host "  Demo Accounts" -ForegroundColor DarkYellow
    Write-Host ""

    $format = "  {0,-28} {1,-20} {2,-18}"
    Write-Host ($format -f "Email", "Password", "Role") -ForegroundColor DarkGray
    Write-Host ($format -f ("=" * 28), ("=" * 20), ("=" * 18)) -ForegroundColor DarkGray
    Write-Host ("  {0,-28}" -f "admin@test.com") -ForegroundColor Cyan -NoNewline
    Write-Host (" {0,-20}" -f "Password123!") -NoNewline
    Write-Host (" {0,-18}" -f "Admin") -ForegroundColor Magenta
    Write-Host ("  {0,-28}" -f "retailer@test.com") -ForegroundColor Cyan -NoNewline
    Write-Host (" {0,-20}" -f "Password123!") -NoNewline
    Write-Host (" {0,-18}" -f "Retailer") -ForegroundColor Magenta
    Write-Host ("  {0,-28}" -f "wholesaler@test.com") -ForegroundColor Cyan -NoNewline
    Write-Host (" {0,-20}" -f "Password123!") -NoNewline
    Write-Host (" {0,-18}" -f "Wholesaler") -ForegroundColor Magenta
    Write-Host ("  {0,-28}" -f "warehouse@test.com") -ForegroundColor Cyan -NoNewline
    Write-Host (" {0,-20}" -f "Password123!") -NoNewline
    Write-Host (" {0,-18}" -f "Warehouse Staff") -ForegroundColor Magenta
    Write-Host ("  {0,-28}" -f "analyst@test.com") -ForegroundColor Cyan -NoNewline
    Write-Host (" {0,-20}" -f "Password123!") -NoNewline
    Write-Host (" {0,-18}" -f "Analyst") -ForegroundColor Magenta
    Write-Host ""
    Write-Divider
    Write-Host ""
    Write-Host "  Press Ctrl+C to stop the dev server." -ForegroundColor DarkGray
    Write-Host "  Run '.\scripts\reset-demo.ps1' to reset everything." -ForegroundColor DarkGray
    Write-Host ""
}

# ─── Change to project root ─────────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

# =============================================================================
# MAIN
# =============================================================================
Write-Banner
Write-Host "  Project root: $ProjectRoot" -ForegroundColor DarkGray
Write-Host ""

# ─── Step 1: Check Node.js ──────────────────────────────────────────────────
Write-Step "Step 1/8: Checking Node.js"

try {
    $nodeVersion = (node -v 2>$null)
} catch {
    $nodeVersion = $null
}

if (-not $nodeVersion) {
    Exit-WithError "Node.js is not installed.`n  Download it at: https://nodejs.org/en/download`n  Required: v20.0.0 or higher"
}

$nodeVersionClean = $nodeVersion -replace "^v", ""
$nodeMajor = [int]($nodeVersionClean.Split(".")[0])

if ($nodeMajor -lt 20) {
    Exit-WithError "Node.js $nodeVersion found, but v20+ is required.`n  Download the latest LTS at: https://nodejs.org/en/download"
}

Write-Success "Node.js $nodeVersion detected"

# ─── Step 2: Check Docker ───────────────────────────────────────────────────
Write-Step "Step 2/8: Checking Docker"

try {
    $dockerVersion = docker --version 2>$null
} catch {
    $dockerVersion = $null
}

if (-not $dockerVersion) {
    Exit-WithError "Docker is not installed.`n  Download it at: https://www.docker.com/products/docker-desktop"
}

try {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker not running" }
} catch {
    Exit-WithError "Docker daemon is not running.`n  Please start Docker Desktop and try again."
}

Write-Success "Docker detected and running"

# Check for docker-compose or docker compose
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
    Exit-WithError "docker-compose is not available.`n  Install Docker Compose or upgrade Docker Desktop."
}

Write-Success "Using compose command: $ComposeCmd"

# ─── Step 3: Install dependencies ───────────────────────────────────────────
Write-Step "Step 3/8: Installing npm dependencies"

if (Test-Path "package-lock.json") {
    Write-Info "Running npm ci (lockfile found)..."
    npm ci --loglevel=warn
} else {
    Write-Info "Running npm install..."
    npm install --loglevel=warn
}

if ($LASTEXITCODE -ne 0) {
    Exit-WithError "npm install failed. Check the output above for details."
}

Write-Success "Dependencies installed"

# ─── Step 4: Environment file ───────────────────────────────────────────────
Write-Step "Step 4/8: Configuring environment"

if (-not (Test-Path ".env.local")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env.local"

        # Generate a random NEXTAUTH_SECRET
        $bytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($bytes)
        $secret = [Convert]::ToBase64String($bytes)

        $envContent = Get-Content ".env.local" -Raw
        $envContent = $envContent -replace "NEXTAUTH_SECRET=.*", "NEXTAUTH_SECRET=$secret"
        Set-Content ".env.local" -Value $envContent -NoNewline

        Write-Success "Generated random NEXTAUTH_SECRET"
        Write-Success "Created .env.local from .env.example"
    } else {
        Exit-WithError ".env.example not found. Is this the right project directory?"
    }
} else {
    Write-Success ".env.local already exists (skipping copy)"
}

# ─── Step 5: Start Docker services ──────────────────────────────────────────
Write-Step "Step 5/8: Starting Docker services (PostgreSQL + Redis)"

if ($ComposeCmd -eq "docker-compose") {
    docker-compose up -d
} else {
    docker compose up -d
}

if ($LASTEXITCODE -ne 0) {
    Exit-WithError "Failed to start Docker services. Check docker-compose.yml and Docker logs."
}

Write-Success "Docker containers started"

# ─── Step 6: Wait for PostgreSQL ─────────────────────────────────────────────
Write-Step "Step 6/8: Waiting for PostgreSQL to be ready"

$maxRetries = 30
$retryInterval = 2
$retries = 0

while ($retries -lt $maxRetries) {
    try {
        docker exec wholesalehub-db pg_isready -U wholesalehub 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $elapsed = $retries * $retryInterval
            Write-Success "PostgreSQL is ready (took ~${elapsed}s)"
            break
        }
    } catch {}

    $retries++
    if ($retries -eq $maxRetries) {
        Exit-WithError "PostgreSQL did not become ready after $($maxRetries * $retryInterval) seconds.`n  Check Docker logs: $ComposeCmd logs postgres"
    }

    Write-Host "`r  Waiting for PostgreSQL... attempt $retries/$maxRetries" -ForegroundColor DarkGray -NoNewline
    Start-Sleep -Seconds $retryInterval
}

# Also verify Redis
try {
    docker exec wholesalehub-redis redis-cli ping 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Redis is ready"
    } else {
        Write-Warn "Redis may not be ready. The app can function without it but caching will be disabled."
    }
} catch {
    Write-Warn "Redis may not be ready. The app can function without it but caching will be disabled."
}

# ─── Step 7: Run Prisma migrations and seed ──────────────────────────────────
Write-Step "Step 7/8: Setting up database"

Write-Info "Generating Prisma client..."
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Exit-WithError "Prisma generate failed. Check prisma/schema.prisma for errors."
}
Write-Success "Prisma client generated"

Write-Info "Running database migrations..."
try {
    npx prisma migrate dev --name init 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Migration 'init' may already exist. Attempting prisma migrate deploy..."
        npx prisma migrate deploy
        if ($LASTEXITCODE -ne 0) {
            Exit-WithError "Database migration failed. Check your DATABASE_URL in .env.local"
        }
    }
} catch {
    Write-Warn "Migration may already exist. Attempting prisma migrate deploy..."
    npx prisma migrate deploy
}
Write-Success "Database migrations applied"

Write-Info "Seeding database with demo data..."
npx prisma db seed
if ($LASTEXITCODE -ne 0) {
    Exit-WithError "Database seeding failed. Check prisma/seed.ts for errors."
}
Write-Success "Database seeded with demo data"

# ─── Step 8: Start dev server ────────────────────────────────────────────────
Write-Step "Step 8/8: Starting development server"

Write-SuccessBanner

npm run dev
