# WholesaleHub

B2B marketplace for smoke shops and gas stations to buy inventory from wholesale distributors. Search products, compare supplier prices side-by-side, and place orders — all in one platform.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Database:** PostgreSQL 16 + Prisma ORM
- **Cache:** Redis 7
- **Auth:** NextAuth.js v5 (credentials provider)
- **State:** Zustand (client) + React Query (server)
- **Styling:** Tailwind CSS with custom brand palette
- **Charts:** Recharts
- **Icons:** Lucide React
- **Validation:** Zod
- **Logging:** Pino

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL + Redis)
- npm

## Getting Started

### 1. Install dependencies

```bash
cd wholesalehub
npm install
```

### 2. Start the database and Redis

```bash
docker-compose up -d
```

### 3. Set up environment

```bash
cp .env.example .env.local
# Edit .env.local if needed (defaults work for local dev)
```

### 4. Run database migrations and seed

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@test.com | Password123! |
| Retailer | retailer@test.com | Password123! |
| Wholesaler | wholesaler@test.com | Password123! |
| Warehouse Staff | warehouse@test.com | Password123! |
| Analyst | analyst@test.com | Password123! |

## Project Structure

```
wholesalehub/
├── prisma/
│   ├── schema.prisma          # Database schema (30+ models)
│   └── seed.ts                # Seed data (5 wholesalers, 10 products, demo users)
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login, Register pages
│   │   ├── (dashboard)/       # All authenticated pages
│   │   │   ├── marketplace/   # Product search + comparison
│   │   │   ├── cart/          # Shopping cart
│   │   │   ├── checkout/      # Order placement
│   │   │   ├── orders/        # Order history + detail
│   │   │   ├── inventory/     # Receiving dashboard
│   │   │   ├── analytics/     # KPIs + charts
│   │   │   ├── suppliers/     # Supplier directory
│   │   │   └── settings/      # User settings
│   │   └── api/               # REST API routes
│   │       ├── auth/          # NextAuth + registration
│   │       ├── products/      # Search, detail
│   │       ├── cart/          # Cart CRUD
│   │       ├── orders/        # Orders CRUD + status
│   │       ├── inventory/     # Barcode scanning
│   │       ├── webhooks/      # HMAC-verified supplier webhooks
│   │       ├── analytics/     # Dashboard data
│   │       └── health/        # Health check
│   ├── components/
│   │   ├── ui/                # Button, Input, Badge, Card, Modal, etc.
│   │   ├── marketplace/       # ProductCard, ProductDetailModal
│   │   └── layout/            # Header, Sidebar
│   ├── lib/                   # prisma, redis, auth, logger, utils, validators
│   │   └── policies/          # Business rules engine
│   ├── hooks/                 # React Query hooks
│   ├── store/                 # Zustand stores (cart, UI)
│   └── types/                 # TypeScript type definitions
├── docker-compose.yml         # PostgreSQL + Redis
└── .github/workflows/ci.yml  # CI/CD pipeline
```

## Key Features

- **Marketplace Search:** Full-text product search with category filters, price range, stock status
- **Price Comparison:** All suppliers sorted by price, cheapest first, with "BEST PRICE" badge
- **Cart & Checkout:** Items grouped by supplier, MOQ validation, separate orders per supplier
- **Order Management:** Status tracking, timeline, wholesaler order confirmation
- **Inventory Receiving:** Barcode scanning, receipt management, discrepancy tracking
- **Webhook Integration:** HMAC-SHA256 verified supplier ASN webhooks
- **Analytics Dashboard:** Revenue charts, category breakdown, supplier scorecard
- **Policy Engine:** Declarative business rules (age verification, state restrictions, MOQ, licensing)
- **Audit Trail:** Immutable event log for all data changes
- **Role-Based Access:** Admin, Retailer, Wholesaler, Warehouse Staff, Analyst

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/products | Search products with filters |
| GET | /api/products/[id] | Product detail with suppliers |
| GET/POST/DELETE | /api/cart | Cart operations |
| GET/POST | /api/orders | List/create orders |
| GET/PATCH | /api/orders/[id] | Order detail/status update |
| POST | /api/inventory/scan | Barcode scan during receiving |
| POST | /api/webhooks/inventory | Supplier ASN webhook (HMAC) |
| GET | /api/analytics | Dashboard analytics data |
| GET | /api/health | Health check |

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed database
npm run db:generate  # Generate Prisma client
npm test             # Run tests
```
