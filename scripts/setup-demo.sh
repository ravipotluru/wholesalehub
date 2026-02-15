#!/usr/bin/env bash
# =============================================================================
# WholesaleHub Demo Setup Script (Mac/Linux/WSL)
# =============================================================================
# This script sets up a complete local development environment for WholesaleHub.
# It checks prerequisites, starts Docker services, runs migrations, seeds the
# database, and launches the dev server.
# =============================================================================

set -euo pipefail

# ─── Color codes ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ─── Brand colors (approximated for terminal) ───────────────────────────────
BRAND_BLUE='\033[38;5;25m'
BRAND_ORANGE='\033[38;5;208m'
BRAND_TEAL='\033[38;5;37m'
BRAND_GREEN='\033[38;5;35m'

# ─── Helper functions ────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
success() { echo -e "${GREEN}[OK]${NC}      $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $1"; }
error()   { echo -e "${RED}[ERROR]${NC}   $1"; }
step()    { echo -e "\n${BRAND_ORANGE}${BOLD}>>> $1${NC}"; }
divider() { echo -e "${DIM}$(printf '%.0s-' {1..70})${NC}"; }

fail_and_exit() {
  error "$1"
  echo -e "${RED}Setup failed. Fix the issue above and re-run this script.${NC}"
  exit 1
}

# ─── Banner ──────────────────────────────────────────────────────────────────
print_banner() {
  echo ""
  echo -e "${BRAND_BLUE}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════════════╗"
  echo "  ║                                                            ║"
  echo "  ║   ██     ██ ██   ██  ██████  ██      ███████ ███████       ║"
  echo "  ║   ██     ██ ██   ██ ██    ██ ██      ██      ██            ║"
  echo "  ║   ██  █  ██ ███████ ██    ██ ██      █████   ███████       ║"
  echo "  ║   ██ ███ ██ ██   ██ ██    ██ ██      ██           ██       ║"
  echo "  ║    ███ ███  ██   ██  ██████  ███████ ███████ ███████       ║"
  echo "  ║                                                            ║"
  echo "  ║            ██   ██ ██    ██ ██████                         ║"
  echo "  ║            ██   ██ ██    ██ ██   ██                        ║"
  echo "  ║            ███████ ██    ██ ██████                         ║"
  echo "  ║            ██   ██ ██    ██ ██   ██                        ║"
  echo "  ║            ██   ██  ██████  ██████                         ║"
  echo "  ║                                                            ║"
  echo "  ║          B2B Wholesale Marketplace Platform                ║"
  echo "  ╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ─── Completion banner ───────────────────────────────────────────────────────
print_success_banner() {
  echo ""
  divider
  echo -e "${BRAND_GREEN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════════════╗"
  echo "  ║              WholesaleHub is running!                      ║"
  echo "  ╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo ""
  echo -e "  ${BRAND_TEAL}${BOLD}Application URL:${NC}  ${BOLD}http://localhost:3000${NC}"
  echo -e "  ${BRAND_TEAL}${BOLD}Prisma Studio:${NC}    ${DIM}Run 'npm run db:studio' in another terminal${NC}"
  echo ""
  divider
  echo ""
  echo -e "  ${BRAND_ORANGE}${BOLD}Demo Accounts${NC}"
  echo ""
  printf "  ${DIM}%-28s %-20s %-18s${NC}\n" "Email" "Password" "Role"
  printf "  ${DIM}%-28s %-20s %-18s${NC}\n" "----------------------------" "--------------------" "------------------"
  printf "  ${CYAN}%-28s${NC} %-20s ${MAGENTA}%-18s${NC}\n" "admin@test.com"      "Password123!" "Admin"
  printf "  ${CYAN}%-28s${NC} %-20s ${MAGENTA}%-18s${NC}\n" "retailer@test.com"   "Password123!" "Retailer"
  printf "  ${CYAN}%-28s${NC} %-20s ${MAGENTA}%-18s${NC}\n" "wholesaler@test.com" "Password123!" "Wholesaler"
  printf "  ${CYAN}%-28s${NC} %-20s ${MAGENTA}%-18s${NC}\n" "warehouse@test.com"  "Password123!" "Warehouse Staff"
  printf "  ${CYAN}%-28s${NC} %-20s ${MAGENTA}%-18s${NC}\n" "analyst@test.com"    "Password123!" "Analyst"
  echo ""
  divider
  echo ""
  echo -e "  ${DIM}Press Ctrl+C to stop the dev server.${NC}"
  echo -e "  ${DIM}Run './scripts/reset-demo.sh' to reset everything.${NC}"
  echo ""
}

# ─── Change to project root ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# =============================================================================
# MAIN
# =============================================================================
print_banner

echo -e "${DIM}Project root: ${PROJECT_ROOT}${NC}"
echo ""

# ─── Step 1: Check Node.js ──────────────────────────────────────────────────
step "Step 1/8: Checking Node.js"

if ! command -v node &> /dev/null; then
  fail_and_exit "Node.js is not installed.\n  Download it at: ${CYAN}https://nodejs.org/en/download${NC}\n  Required: v20.0.0 or higher"
fi

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt 20 ]; then
  fail_and_exit "Node.js v${NODE_VERSION} found, but v20+ is required.\n  Download the latest LTS at: ${CYAN}https://nodejs.org/en/download${NC}"
fi

success "Node.js v${NODE_VERSION} detected"

# ─── Step 2: Check Docker ───────────────────────────────────────────────────
step "Step 2/8: Checking Docker"

if ! command -v docker &> /dev/null; then
  fail_and_exit "Docker is not installed.\n  Download it at: ${CYAN}https://www.docker.com/products/docker-desktop${NC}"
fi

if ! docker info &> /dev/null; then
  fail_and_exit "Docker daemon is not running.\n  Please start Docker Desktop and try again."
fi

DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
success "Docker v${DOCKER_VERSION} detected and running"

# Also check docker-compose / docker compose
if command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
else
  fail_and_exit "docker-compose is not available.\n  Install Docker Compose or upgrade Docker Desktop."
fi

success "Using compose command: ${COMPOSE_CMD}"

# ─── Step 3: Install dependencies ───────────────────────────────────────────
step "Step 3/8: Installing npm dependencies"

if [ -f "package-lock.json" ]; then
  info "Running npm ci (lockfile found)..."
  npm ci --loglevel=warn
else
  info "Running npm install..."
  npm install --loglevel=warn
fi

success "Dependencies installed"

# ─── Step 4: Environment file ───────────────────────────────────────────────
step "Step 4/8: Configuring environment"

if [ ! -f ".env.local" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env.local
    # Generate a random NEXTAUTH_SECRET
    if command -v openssl &> /dev/null; then
      SECRET=$(openssl rand -base64 32)
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${SECRET}|" .env.local
      else
        sed -i "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${SECRET}|" .env.local
      fi
      success "Generated random NEXTAUTH_SECRET"
    else
      warn "Could not generate NEXTAUTH_SECRET. Please set it manually in .env.local"
    fi
    success "Created .env.local from .env.example"
  else
    fail_and_exit ".env.example not found. Is this the right project directory?"
  fi
else
  success ".env.local already exists (skipping copy)"
fi

# ─── Step 5: Start Docker services ──────────────────────────────────────────
step "Step 5/8: Starting Docker services (PostgreSQL + Redis)"

$COMPOSE_CMD up -d

success "Docker containers started"

# ─── Step 6: Wait for PostgreSQL ─────────────────────────────────────────────
step "Step 6/8: Waiting for PostgreSQL to be ready"

MAX_RETRIES=30
RETRY_INTERVAL=2
RETRIES=0

while [ $RETRIES -lt $MAX_RETRIES ]; do
  if docker exec wholesalehub-db pg_isready -U wholesalehub &> /dev/null; then
    success "PostgreSQL is ready (took ~$((RETRIES * RETRY_INTERVAL))s)"
    break
  fi

  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -eq $MAX_RETRIES ]; then
    fail_and_exit "PostgreSQL did not become ready after $((MAX_RETRIES * RETRY_INTERVAL)) seconds.\n  Check Docker logs: ${COMPOSE_CMD} logs postgres"
  fi

  echo -ne "\r  ${DIM}Waiting for PostgreSQL... attempt ${RETRIES}/${MAX_RETRIES}${NC}"
  sleep $RETRY_INTERVAL
done

# Also verify Redis
if docker exec wholesalehub-redis redis-cli ping &> /dev/null; then
  success "Redis is ready"
else
  warn "Redis may not be ready. The app can function without it but caching will be disabled."
fi

# ─── Step 7: Run Prisma migrations and seed ──────────────────────────────────
step "Step 7/8: Setting up database"

info "Generating Prisma client..."
npx prisma generate
success "Prisma client generated"

info "Running database migrations..."
npx prisma migrate dev --name init 2>&1 || {
  # If migration already exists, just deploy
  warn "Migration 'init' may already exist. Attempting prisma migrate deploy..."
  npx prisma migrate deploy
}
success "Database migrations applied"

info "Seeding database with demo data..."
npx prisma db seed
success "Database seeded with demo data"

# ─── Step 8: Start dev server ────────────────────────────────────────────────
step "Step 8/8: Starting development server"

print_success_banner

exec npm run dev
