<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" alt="Next.js 14" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-5.22-2D3748?style=for-the-badge&logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis" alt="Redis" />
  <img src="https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwind-css" alt="Tailwind" />
</p>

# WholesaleHub

> **B2B wholesale marketplace** for smoke shops and gas stations to purchase inventory from wholesale distributors. Search products, compare supplier prices side-by-side, place orders, receive inventory with barcode scanning — all in one platform.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Demo Accounts](#demo-accounts)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Enterprise Capabilities](#enterprise-capabilities)
- [Brand Design System](#brand-design-system)
- [Scripts](#scripts)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)

---

## Features

### Core Marketplace
- **Product Search** — Full-text search with category filters, price range, stock status, and sort options
- **Price Comparison** — All suppliers sorted by price ascending; cheapest gets a **"BEST PRICE"** badge
- **Shopping Cart** — Items grouped by supplier, MOQ (Minimum Order Quantity) validation per supplier
- **Checkout** — Orders automatically split per supplier at checkout
- **Order Management** — Full lifecycle tracking with status timeline for both retailers and wholesalers

### Inventory & Warehouse
- **Receiving Dashboard** — Track inbound shipments with line-by-line verification
- **Barcode Scanning** — Scan products during receiving to match against purchase orders
- **Discrepancy Tracking** — Flag quantity mismatches, damaged goods, wrong items
- **AI Document Extraction** — Automatically extract data from supplier invoices/packing slips

### Business Intelligence
- **Analytics Dashboard** — Revenue trends, category breakdown, supplier scorecard (Recharts)
- **Anomaly Detection** — Z-score pricing anomalies, unusual order patterns, inventory shortage alerts
- **Evaluation Framework** — Search quality metrics (MRR, Recall@10, F1), extraction accuracy, policy correctness

### Enterprise Features
- **Semantic Search** — pgvector + AWS Bedrock Titan Embeddings with hybrid keyword/semantic + RRF ranking
- **Policy Engine** — Declarative rules for age verification, state restrictions, MOQ, license validation
- **Audit Trail** — Immutable event log for all data changes with before/after state and trace IDs
- **Data Lineage** — Full transformation chain from source document to final record
- **LLMOps** — Prompt versioning, invocation tracking, cost dashboards, A/B testing
- **Feedback Loops** — Human corrections feed few-shot examples; false positives auto-tune thresholds

### Platform
- **5 User Roles** — Admin, Retailer, Wholesaler, Warehouse Staff, Analyst
- **Notification System** — In-app notifications for orders, price alerts, stock alerts, anomalies
- **Webhook Integration** — HMAC-SHA256 verified supplier ASN webhooks
- **Health Checks** — `/api/health` endpoint for monitoring
- **CI/CD** — GitHub Actions pipeline (lint, typecheck, test, build)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js 14 App Router                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │   Auth    │  │Marketplace│  │   Cart   │  │Inventory│ │
│  │  Pages   │  │  Search   │  │ Checkout │  │Receiving│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬───┘ │
│       │              │              │              │     │
│  ┌────┴──────────────┴──────────────┴──────────────┴──┐ │
│  │              API Routes (/api/*)                    │ │
│  │  products | cart | orders | inventory | webhooks    │ │
│  │  admin/* | notifications | analytics | health      │ │
│  └────┬──────────────┬──────────────┬─────────────────┘ │
│       │              │              │                    │
│  ┌────┴────┐   ┌─────┴────┐  ┌─────┴──────┐           │
│  │ Prisma  │   │  Redis   │  │ AWS Bedrock │           │
│  │  ORM    │   │  Cache   │  │ Titan+Claude│           │
│  └────┬────┘   └──────────┘  └─────────────┘           │
│       │                                                  │
│  ┌────┴─────────────────────────────────────────┐       │
│  │        PostgreSQL 16 + pgvector              │       │
│  │  35+ tables | vector embeddings | full-text  │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router, Server Components) |
| **Language** | TypeScript 5.7 (strict mode, zero `any`) |
| **Database** | PostgreSQL 16 + pgvector extension |
| **ORM** | Prisma 5.22 (35+ models) |
| **Cache** | Redis 7 (ioredis) |
| **Auth** | NextAuth.js v5 (credentials + Prisma adapter) |
| **Client State** | Zustand 4.5 |
| **Server State** | TanStack React Query v5 |
| **Styling** | Tailwind CSS 3.4 + custom design tokens |
| **Charts** | Recharts 2.15 |
| **Icons** | Lucide React |
| **Validation** | Zod 3.24 |
| **Logging** | Pino 9 + pino-pretty |
| **AI/ML** | AWS Bedrock (Titan Embeddings V2, Claude 3 Sonnet) |
| **Forms** | React Hook Form + @hookform/resolvers |
| **CI/CD** | GitHub Actions |

---

## Quick Start

### Option A: One-Command Setup (Recommended)

**Windows (PowerShell):**
```powershell
.\scripts\setup-demo.ps1
```

**macOS/Linux (Bash):**
```bash
chmod +x scripts/setup-demo.sh
./scripts/setup-demo.sh
```

This script automatically:
1. Checks Node.js 20+ and Docker
2. Installs npm dependencies
3. Creates `.env.local` with auto-generated secrets
4. Starts PostgreSQL + Redis via Docker
5. Runs Prisma migrations and seeds the database
6. Launches the dev server at **http://localhost:3000**

### Option B: Manual Setup

```bash
# 1. Install dependencies
npm install

# 2. Start database and Redis
docker-compose up -d

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local if needed (defaults work for local dev)

# 4. Generate Prisma client
npx prisma generate

# 5. Run migrations and seed
npx prisma migrate dev --name init
npx prisma db seed

# 6. Start dev server
npm run dev
```

### Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/en/download)
- **Docker Desktop** — [Download](https://www.docker.com/products/docker-desktop)
  - Requires hardware virtualization enabled in BIOS (Intel VT-x / AMD-V)

---

## Demo Accounts

| Role | Email | Password | What You See |
|------|-------|----------|-------------|
| **Admin** | admin@test.com | Password123! | Full platform + admin tools (audit, LLMOps, anomalies, evaluations) |
| **Retailer** | retailer@test.com | Password123! | Marketplace, cart, orders, notifications |
| **Wholesaler** | wholesaler@test.com | Password123! | Product management, pricing, incoming orders |
| **Warehouse** | warehouse@test.com | Password123! | Inventory receiving, barcode scanning |
| **Analyst** | analyst@test.com | Password123! | Analytics dashboards |

---

## Project Structure

```
wholesalehub/
├── .github/workflows/ci.yml        # CI/CD pipeline
├── prisma/
│   ├── schema.prisma                # 35+ database models
│   ├── seed.ts                      # Demo data (users, products, orders, enterprise data)
│   └── migrations/
│       └── add_vector_extension.sql # pgvector setup
├── scripts/
│   ├── setup-demo.sh / .ps1         # One-command setup
│   ├── reset-demo.sh / .ps1         # Full reset
│   └── setup-check.js               # Diagnostics
├── src/
│   ├── app/
│   │   ├── (auth)/                  # Login, Register
│   │   ├── (dashboard)/
│   │   │   ├── marketplace/         # Product search + comparison
│   │   │   ├── cart/                # Shopping cart
│   │   │   ├── checkout/            # Order placement
│   │   │   ├── orders/              # Order history + [id] detail
│   │   │   ├── inventory/           # Receiving + review + [id] detail
│   │   │   ├── products/            # Supplier product management
│   │   │   ├── pricing/             # Price comparison for suppliers
│   │   │   ├── incoming-orders/     # Supplier order management
│   │   │   ├── analytics/           # KPI dashboards
│   │   │   ├── notifications/       # Notification center
│   │   │   ├── suppliers/           # Supplier directory
│   │   │   ├── settings/            # User settings
│   │   │   └── admin/
│   │   │       ├── audit/           # Audit trail viewer
│   │   │       ├── evaluations/     # ML evaluation dashboard
│   │   │       ├── llmops/          # LLM operations dashboard
│   │   │       ├── anomalies/       # Anomaly detection dashboard
│   │   │       └── lineage/         # Data lineage explorer
│   │   └── api/
│   │       ├── auth/                # NextAuth + registration
│   │       ├── products/            # CRUD + search + suggestions
│   │       ├── cart/                # Cart operations
│   │       ├── orders/              # Orders CRUD + status
│   │       ├── inventory/           # Scan + extract + review
│   │       ├── notifications/       # Notification CRUD
│   │       ├── admin/               # Audit, lineage, evals, LLMOps, anomalies, feedback
│   │       ├── webhooks/            # HMAC-verified supplier webhooks
│   │       ├── analytics/           # Dashboard data
│   │       └── health/              # Health check
│   ├── components/
│   │   ├── ui/                      # 15 reusable components (Button, Card, Modal, DataTable, etc.)
│   │   ├── marketplace/             # ProductCard, SearchBar, FilterPanel, PriceHistoryChart
│   │   ├── cart/                    # CartItemRow, SupplierGroup, CartSummary, MoqWarning
│   │   ├── inventory/               # ReceiptLineTable, ScannerModal, DiscrepancyCard
│   │   └── layout/                  # Header, Sidebar, NotificationDropdown
│   ├── lib/
│   │   ├── ai/                      # Document classifier, entity resolver, orchestration, validation loops
│   │   ├── anomaly/                 # Pricing, order, inventory anomaly detection
│   │   ├── evaluation/              # Search, extraction, policy evaluation + runner
│   │   ├── feedback/                # Correction tracker, threshold tuner
│   │   ├── llmops/                  # Prompt registry, invocation tracker, A/B testing
│   │   ├── policies/                # Business rules engine
│   │   ├── auth.ts                  # NextAuth configuration
│   │   ├── prisma.ts                # Prisma client singleton
│   │   ├── redis.ts                 # Redis client with graceful fallback
│   │   ├── search.ts                # Hybrid search (keyword + semantic + RRF)
│   │   ├── embeddings.ts            # AWS Bedrock Titan embeddings
│   │   ├── audit.ts                 # Audit trail logging
│   │   ├── lineage.ts               # Data lineage tracking
│   │   └── logger.ts                # Pino structured logging
│   ├── hooks/                       # useProducts, useCart, useOrders, useNotifications, useSupplierData
│   ├── store/                       # Zustand stores (cart, UI)
│   └── types/                       # TypeScript type definitions
├── docker-compose.yml               # PostgreSQL 16 + Redis 7
├── tailwind.config.ts               # Brand colors + custom utilities
├── tsconfig.json                    # TypeScript strict config
└── package.json                     # Scripts + dependencies
```

---

## API Reference

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/products` | Search products with filters (q, category, sort, stockStatus, page, limit) |
| `GET` | `/api/products/[id]` | Product detail with all supplier prices |
| `GET` | `/api/products/search` | Hybrid semantic + keyword search |
| `GET` | `/api/products/suggestions` | Autocomplete suggestions |

### Cart & Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST/DELETE` | `/api/cart` | Cart CRUD operations |
| `GET/POST` | `/api/orders` | List orders / place new order |
| `GET/PATCH` | `/api/orders/[id]` | Order detail / update status |

### Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/inventory/scan` | Barcode scan during receiving |
| `POST` | `/api/inventory/extract` | AI document extraction from invoices |
| `GET/POST/PATCH` | `/api/inventory/review` | Human review queue for extractions |
| `POST` | `/api/webhooks/inventory` | HMAC-SHA256 verified supplier ASN webhook |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/audit` | Query audit trail events |
| `GET` | `/api/admin/lineage` | Data lineage chain lookup |
| `GET/POST` | `/api/admin/evaluations` | List/trigger evaluation runs |
| `GET/POST` | `/api/admin/llmops` | LLM dashboard + prompt management |
| `GET/POST` | `/api/admin/anomalies` | Anomaly reports |
| `GET/POST/PATCH` | `/api/admin/feedback` | Corrections + threshold tuning |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/PATCH` | `/api/notifications` | User notifications |
| `GET` | `/api/analytics` | Dashboard analytics data |
| `GET` | `/api/health` | Health check (DB, Redis, uptime) |

---

## Enterprise Capabilities

| Capability | Module | Description |
|-----------|--------|-------------|
| **Semantic Search** | `src/lib/search.ts` | Hybrid keyword + vector search with RRF ranking (k=60) |
| **AI Extraction** | `src/lib/ai/` | Multi-step pipeline: classify → extract → resolve → validate → route |
| **Validation Loops** | `src/lib/ai/validation-loop.ts` | Zod schema + business rules + 3-attempt self-correction |
| **Anomaly Detection** | `src/lib/anomaly/` | Pricing Z-scores, order patterns, inventory shortages |
| **LLMOps** | `src/lib/llmops/` | Prompt versioning, cost tracking, A/B testing |
| **Feedback** | `src/lib/feedback/` | Correction → few-shot, FP → threshold tuning |
| **Evaluation** | `src/lib/evaluation/` | Search MRR/Recall/F1, extraction accuracy, policy correctness |
| **Audit Trail** | `src/lib/audit.ts` | Immutable events with before/after diff |
| **Data Lineage** | `src/lib/lineage.ts` | Source → transformation chain tracking |
| **Policy Engine** | `src/lib/policies/` | Age, state, MOQ, license validation rules |

---

## Brand Design System

| Token | Hex | Usage |
|-------|-----|-------|
| **Primary Blue** | `#1E4D8C` | Navigation, headers, primary actions |
| **Action Orange** | `#FF6A00` | CTA buttons, highlights |
| **Accent Teal** | `#20A39E` | Links, icons, active states |
| **Success Green** | `#00B894` | BEST PRICE badge, success states |
| **Dark Gray** | `#2D3436` | Body text |
| **Light Gray** | `#F5F6FA` | Page backgrounds |

---

## Scripts

```bash
# Development
npm run dev              # Start Next.js dev server
npm run build            # Production build
npm run start            # Start production server

# Code Quality
npm run lint             # ESLint
npm run typecheck        # TypeScript strict check

# Database
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run migrations
npm run db:seed          # Seed demo data
npm run db:reset         # Reset database (drop + recreate + seed)
npm run db:studio        # Open Prisma Studio (visual DB browser)

# Docker
npm run docker:up        # Start PostgreSQL + Redis
npm run docker:down      # Stop containers
npm run docker:reset     # Stop + remove volumes

# Testing
npm test                 # Jest unit tests
npm run test:watch       # Jest watch mode
npm run test:coverage    # Jest with coverage report
npm run test:e2e         # Playwright E2E tests

# Setup
npm run setup            # Run setup diagnostics check
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://wholesalehub:wholesalehub@localhost:5432/wholesalehub` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `NEXTAUTH_URL` | `http://localhost:3000` | NextAuth base URL |
| `NEXTAUTH_SECRET` | (auto-generated) | Session encryption key |
| `AWS_REGION` | `us-east-1` | AWS region for Bedrock |
| `AWS_ACCESS_KEY_ID` | (optional) | AWS credentials for AI features |
| `AWS_SECRET_ACCESS_KEY` | (optional) | AWS credentials for AI features |
| `WEBHOOK_SECRET` | `whsec_demo_secret_key` | HMAC-SHA256 webhook verification |

> **Note:** AWS credentials are optional. The app uses deterministic mock embeddings and responses when AWS is not configured, so all features work in demo mode.

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is proprietary software. All rights reserved.

---

<p align="center">
  Built with Next.js, TypeScript, PostgreSQL, and Prisma
</p>
