#!/usr/bin/env node
// =============================================================================
// WholesaleHub Environment Validation Script
// =============================================================================
// Validates the local development environment by checking:
// - Node.js version (20+)
// - npm availability
// - Docker availability and daemon status
// - Required environment variables
// - Database connectivity (PostgreSQL)
// - Redis connectivity
// - Prisma client generation status
//
// Usage: node scripts/setup-check.js
//        npm run setup
// =============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

// ─── Configuration ──────────────────────────────────────────────────────────
const MIN_NODE_VERSION = 20;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const ENV_EXAMPLE = path.join(PROJECT_ROOT, '.env.example');
const SCHEMA_FILE = path.join(PROJECT_ROOT, 'prisma', 'schema.prisma');
const DOCKER_COMPOSE_FILE = path.join(PROJECT_ROOT, 'docker-compose.yml');

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'REDIS_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
];

const OPTIONAL_ENV_VARS = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'BEDROCK_EMBEDDING_MODEL',
  'BEDROCK_LLM_MODEL',
  'OPENAI_API_KEY',
  'WEBHOOK_SECRET',
];

// ─── Colors ─────────────────────────────────────────────────────────────────
const color = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
};

// ─── Status tracking ────────────────────────────────────────────────────────
let passCount = 0;
let warnCount = 0;
let failCount = 0;

function pass(label, detail) {
  passCount++;
  console.log(`  ${color.green}PASS${color.reset}  ${label}${detail ? color.dim + ' - ' + detail + color.reset : ''}`);
}

function warn(label, detail) {
  warnCount++;
  console.log(`  ${color.yellow}WARN${color.reset}  ${label}${detail ? color.dim + ' - ' + detail + color.reset : ''}`);
}

function fail(label, detail) {
  failCount++;
  console.log(`  ${color.red}FAIL${color.reset}  ${label}${detail ? color.dim + ' - ' + detail + color.reset : ''}`);
}

function header(title) {
  console.log(`\n${color.cyan}${color.bold}--- ${title} ---${color.reset}`);
}

function divider() {
  console.log(color.dim + '-'.repeat(60) + color.reset);
}

// ─── Utility: run a command silently ────────────────────────────────────────
function runSilent(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// ─── Utility: check if a TCP port is reachable ──────────────────────────────
function checkPort(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const done = (result) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
    socket.connect(port, host);
  });
}

// ─── Utility: parse env file ────────────────────────────────────────────────
function parseEnvFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    vars[key] = value;
  }
  return vars;
}

// =============================================================================
// CHECKS
// =============================================================================

async function checkNodeVersion() {
  header('Node.js');

  const version = process.version;
  const major = parseInt(version.replace('v', '').split('.')[0], 10);

  if (major >= MIN_NODE_VERSION) {
    pass('Node.js version', `${version} (required: v${MIN_NODE_VERSION}+)`);
  } else {
    fail('Node.js version', `${version} found, but v${MIN_NODE_VERSION}+ is required. Download: https://nodejs.org/en/download`);
  }

  // Check npm
  const npmVersion = runSilent('npm --version');
  if (npmVersion) {
    pass('npm', `v${npmVersion}`);
  } else {
    fail('npm', 'not found');
  }
}

function checkDocker() {
  header('Docker');

  const dockerVersion = runSilent('docker --version');
  if (dockerVersion) {
    pass('Docker CLI', dockerVersion.replace('Docker version ', '').split(',')[0]);
  } else {
    fail('Docker CLI', 'not installed. Download: https://www.docker.com/products/docker-desktop');
    return;
  }

  // Check daemon
  const dockerInfo = runSilent('docker info');
  if (dockerInfo) {
    pass('Docker daemon', 'running');
  } else {
    fail('Docker daemon', 'not running. Start Docker Desktop and try again.');
    return;
  }

  // Check compose
  let composeVersion = runSilent('docker-compose version --short');
  if (composeVersion) {
    pass('docker-compose', `v${composeVersion}`);
  } else {
    composeVersion = runSilent('docker compose version --short');
    if (composeVersion) {
      pass('docker compose', `v${composeVersion}`);
    } else {
      fail('docker-compose', 'not available');
    }
  }

  // Check if containers are running
  const psOutput = runSilent('docker ps --format "{{.Names}}"');
  if (psOutput) {
    const containers = psOutput.split('\n').filter(Boolean);
    const dbRunning = containers.includes('wholesalehub-db');
    const redisRunning = containers.includes('wholesalehub-redis');

    if (dbRunning) {
      pass('PostgreSQL container', 'wholesalehub-db is running');
    } else {
      warn('PostgreSQL container', 'wholesalehub-db is not running. Run: docker-compose up -d');
    }

    if (redisRunning) {
      pass('Redis container', 'wholesalehub-redis is running');
    } else {
      warn('Redis container', 'wholesalehub-redis is not running. Run: docker-compose up -d');
    }
  } else {
    warn('Docker containers', 'could not list running containers');
  }
}

function checkProjectFiles() {
  header('Project Files');

  // docker-compose.yml
  if (fs.existsSync(DOCKER_COMPOSE_FILE)) {
    pass('docker-compose.yml', 'found');
  } else {
    fail('docker-compose.yml', 'missing');
  }

  // Prisma schema
  if (fs.existsSync(SCHEMA_FILE)) {
    pass('prisma/schema.prisma', 'found');
  } else {
    fail('prisma/schema.prisma', 'missing');
  }

  // package.json
  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) {
    pass('package.json', 'found');
  } else {
    fail('package.json', 'missing');
  }

  // node_modules
  const nodeModules = path.join(PROJECT_ROOT, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    pass('node_modules', 'installed');
  } else {
    warn('node_modules', 'missing. Run: npm install');
  }

  // Prisma client
  const prismaClient = path.join(PROJECT_ROOT, 'node_modules', '.prisma', 'client');
  if (fs.existsSync(prismaClient)) {
    pass('Prisma client', 'generated');
  } else {
    warn('Prisma client', 'not generated. Run: npx prisma generate');
  }

  // .next directory
  const nextDir = path.join(PROJECT_ROOT, '.next');
  if (fs.existsSync(nextDir)) {
    pass('.next build cache', 'present');
  } else {
    warn('.next build cache', 'not built yet (normal for first setup)');
  }
}

function checkEnvironment() {
  header('Environment Variables');

  // Check .env.local exists
  if (!fs.existsSync(ENV_FILE)) {
    fail('.env.local', 'file not found. Copy from .env.example: cp .env.example .env.local');
    return;
  }
  pass('.env.local', 'file exists');

  const envVars = parseEnvFile(ENV_FILE);

  // Required vars
  for (const key of REQUIRED_ENV_VARS) {
    const value = envVars[key];
    if (!value || value === '' || value.includes('generate-with') || value.includes('your-')) {
      fail(key, 'not set or still has placeholder value');
    } else {
      // Mask sensitive values
      const masked = key.includes('SECRET') || key.includes('PASSWORD')
        ? value.substring(0, 4) + '...' + value.substring(value.length - 4)
        : value;
      pass(key, masked);
    }
  }

  // Optional vars
  for (const key of OPTIONAL_ENV_VARS) {
    const value = envVars[key];
    if (value && value !== '' && !value.includes('your-')) {
      pass(key, '(optional) configured');
    } else {
      warn(key, '(optional) not configured - related features will be disabled');
    }
  }
}

async function checkConnectivity() {
  header('Service Connectivity');

  // PostgreSQL (default: localhost:5432)
  const dbReachable = await checkPort('localhost', 5432);
  if (dbReachable) {
    pass('PostgreSQL (localhost:5432)', 'port is reachable');
  } else {
    fail('PostgreSQL (localhost:5432)', 'port is not reachable. Is Docker running? Run: docker-compose up -d');
  }

  // Redis (default: localhost:6379)
  const redisReachable = await checkPort('localhost', 6379);
  if (redisReachable) {
    pass('Redis (localhost:6379)', 'port is reachable');
  } else {
    warn('Redis (localhost:6379)', 'port is not reachable. App will work but caching is disabled.');
  }
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  console.log('');
  console.log(`${color.cyan}${color.bold}============================================================${color.reset}`);
  console.log(`${color.cyan}${color.bold}  WholesaleHub Environment Check${color.reset}`);
  console.log(`${color.cyan}${color.bold}============================================================${color.reset}`);
  console.log(`${color.dim}  Project: ${PROJECT_ROOT}${color.reset}`);
  console.log(`${color.dim}  Time:    ${new Date().toISOString()}${color.reset}`);

  await checkNodeVersion();
  checkDocker();
  checkProjectFiles();
  checkEnvironment();
  await checkConnectivity();

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  divider();
  console.log('');
  console.log(`${color.bold}  Summary${color.reset}`);
  console.log(`    ${color.green}Passed:${color.reset}   ${passCount}`);
  console.log(`    ${color.yellow}Warnings:${color.reset} ${warnCount}`);
  console.log(`    ${color.red}Failed:${color.reset}   ${failCount}`);
  console.log('');

  if (failCount > 0) {
    console.log(`${color.red}${color.bold}  Some checks failed. Fix the issues above before running the app.${color.reset}`);
    console.log(`${color.dim}  Run the setup script to fix most issues automatically:${color.reset}`);
    if (process.platform === 'win32') {
      console.log(`${color.cyan}    .\\scripts\\setup-demo.ps1${color.reset}`);
    } else {
      console.log(`${color.cyan}    ./scripts/setup-demo.sh${color.reset}`);
    }
    console.log('');
    process.exit(1);
  } else if (warnCount > 0) {
    console.log(`${color.yellow}${color.bold}  Environment is mostly ready, but some optional items need attention.${color.reset}`);
    console.log(`${color.dim}  Warnings are non-blocking but may affect some features.${color.reset}`);
    console.log('');
    process.exit(0);
  } else {
    console.log(`${color.green}${color.bold}  All checks passed! Your environment is ready.${color.reset}`);
    console.log(`${color.dim}  Start the dev server with: npm run dev${color.reset}`);
    console.log('');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`${color.red}Unexpected error during environment check:${color.reset}`, err);
  process.exit(1);
});
