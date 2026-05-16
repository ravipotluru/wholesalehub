-- ============================================================
-- WholesaleHub: multi-location ship-to addresses
-- ============================================================
-- Adds the `retailer_locations` table so a single Retailer (the bill-to
-- legal entity) can have many physical store locations. Checkout selects
-- which location a particular order ships to. Hand-written because this
-- repo manages migrations as raw SQL alongside Prisma schema edits.
--
-- Backward-compat:
--   - Existing `orders` rows keep `shipTo*` snapshot columns intact; the
--     new `shipToLocationId` is nullable so legacy orders without a
--     RetailerLocation aren't disturbed.
--   - Retailers with zero locations continue to work via the legacy
--     `shippingAddress` body fields on POST /api/orders.
--
-- Run with:
--   psql -d wholesalehub -f prisma/migrations/add_retailer_locations/migration.sql
-- ============================================================

-- 1. New ship-to location table.
CREATE TABLE IF NOT EXISTS "retailer_locations" (
  "id"           TEXT          NOT NULL,
  "retailerId"   TEXT          NOT NULL,
  "label"        TEXT          NOT NULL,
  "address"      TEXT          NOT NULL,
  "city"         TEXT          NOT NULL,
  "state"        TEXT          NOT NULL,
  "zipCode"      TEXT          NOT NULL,
  "contactName"  TEXT,
  "contactPhone" TEXT,
  "notes"        TEXT,
  "isDefault"    BOOLEAN       NOT NULL DEFAULT false,
  "isActive"     BOOLEAN       NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "retailer_locations_pkey" PRIMARY KEY ("id")
);

-- 2. Filter helpers — list-by-retailer + active filter, default-first sort.
CREATE INDEX IF NOT EXISTS "retailer_locations_retailerId_isActive_idx"
  ON "retailer_locations" ("retailerId", "isActive");

CREATE INDEX IF NOT EXISTS "retailer_locations_retailerId_isDefault_idx"
  ON "retailer_locations" ("retailerId", "isDefault");

-- 3. FK to retailers. Restrict on delete — Prisma schema does not cascade,
--    and a Retailer with locations should not be silently dropped.
ALTER TABLE "retailer_locations"
  ADD CONSTRAINT "retailer_locations_retailerId_fkey"
  FOREIGN KEY ("retailerId") REFERENCES "retailers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Add `shipToLocationId` to orders (nullable for backward-compat).
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "shipToLocationId" TEXT;

-- 5. Lookup index for "all orders shipping to this location" queries.
CREATE INDEX IF NOT EXISTS "orders_shipToLocationId_idx"
  ON "orders" ("shipToLocationId");

-- 6. FK from orders to retailer_locations. SET NULL on delete is safer than
--    cascading — historical orders should keep their snapshot shipTo*
--    fields even if the location row is later removed (we soft-delete in
--    the API anyway, but DB-level safety as belt-and-braces).
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_shipToLocationId_fkey"
  FOREIGN KEY ("shipToLocationId") REFERENCES "retailer_locations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
