#!/usr/bin/env bash
# =============================================================================
# WholesaleHub Demo Reset Script (Mac/Linux/WSL)
# =============================================================================
# This script tears down the entire development environment (Docker containers
# and volumes) and re-runs the full setup from scratch.
# =============================================================================

set -euo pipefail

# ─── Color codes ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

BRAND_ORANGE='\033[38;5;208m'

# ─── Helper functions ────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
success() { echo -e "${GREEN}[OK]${NC}      $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $1"; }
error()   { echo -e "${RED}[ERROR]${NC}   $1"; }
step()    { echo -e "\n${BRAND_ORANGE}${BOLD}>>> $1${NC}"; }
divider() { echo -e "${DIM}$(printf '%.0s-' {1..70})${NC}"; }

fail_and_exit() {
  error "$1"
  exit 1
}

# ─── Change to project root ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ─── Detect compose command ─────────────────────────────────────────────────
if command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
else
  fail_and_exit "docker-compose is not available."
fi

# =============================================================================
# MAIN
# =============================================================================
echo ""
echo -e "${RED}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║               WholesaleHub - FULL RESET                    ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${YELLOW}This will:${NC}"
echo -e "  1. Stop all Docker containers"
echo -e "  2. Remove Docker volumes (${RED}all database data will be lost${NC})"
echo -e "  3. Remove node_modules"
echo -e "  4. Remove .next build cache"
echo -e "  5. Re-run full setup from scratch"
echo ""

# ─── Confirm ─────────────────────────────────────────────────────────────────
read -r -p "Are you sure you want to reset everything? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo -e "${DIM}Reset cancelled.${NC}"
  exit 0
fi

echo ""

# ─── Step 1: Stop containers ────────────────────────────────────────────────
step "Step 1/5: Stopping Docker containers"

$COMPOSE_CMD down 2>/dev/null || true
success "Docker containers stopped"

# ─── Step 2: Remove volumes ─────────────────────────────────────────────────
step "Step 2/5: Removing Docker volumes"

$COMPOSE_CMD down -v 2>/dev/null || true
success "Docker volumes removed"

# ─── Step 3: Clean build artifacts ───────────────────────────────────────────
step "Step 3/5: Cleaning build artifacts"

if [ -d "node_modules" ]; then
  info "Removing node_modules..."
  rm -rf node_modules
  success "node_modules removed"
else
  success "node_modules already clean"
fi

if [ -d ".next" ]; then
  info "Removing .next build cache..."
  rm -rf .next
  success ".next removed"
else
  success ".next already clean"
fi

if [ -d "node_modules/.prisma" ]; then
  info "Removing Prisma generated client..."
  rm -rf node_modules/.prisma
  success "Prisma client removed"
fi

# ─── Step 4: Remove generated migration if present ──────────────────────────
step "Step 4/5: Cleaning Prisma migrations"

if [ -d "prisma/migrations" ]; then
  info "Removing existing migrations directory..."
  rm -rf prisma/migrations
  success "Migrations directory removed"
else
  success "No migrations directory found"
fi

# ─── Step 5: Re-run setup ───────────────────────────────────────────────────
step "Step 5/5: Re-running full setup"

divider
echo ""
echo -e "${GREEN}${BOLD}Environment cleaned. Starting fresh setup...${NC}"
echo ""
divider

exec "$SCRIPT_DIR/setup-demo.sh"
