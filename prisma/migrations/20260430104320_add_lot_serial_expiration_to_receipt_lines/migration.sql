-- ============================================================
-- WholesaleHub: lot/serial/expiration tracking on receipt lines
-- ============================================================
-- Adds compliance tracking columns required for tobacco/vape recalls.
-- All new columns are NULLABLE with no default, so existing rows are
-- unaffected and no backfill is required (one-step migration; the
-- two-step rule in .claude/rules/schema.md applies to required
-- columns and column drops/renames, not to additive nullable fields).
--
-- Tables touched:
--   - receipt_lines : add lotNumber / serialNumber / expirationDate / manufactureDate
--                     + indexes on lotNumber and expirationDate for recall lookups
--   - receipt_scans : add lotNumber / serialNumber / expirationDate
--                     + index on lotNumber so recall queries can fall back
--                       to the scan log when ReceiptLine.lotNumber is NULL
--                       (multi-lot deliveries against a single SKU line).
-- ============================================================

-- ─── receipt_lines ────────────────────────────────────────────
ALTER TABLE "receipt_lines" ADD COLUMN "lotNumber" TEXT;
ALTER TABLE "receipt_lines" ADD COLUMN "serialNumber" TEXT;
ALTER TABLE "receipt_lines" ADD COLUMN "expirationDate" TIMESTAMP(3);
ALTER TABLE "receipt_lines" ADD COLUMN "manufactureDate" TIMESTAMP(3);

CREATE INDEX "receipt_lines_lotNumber_idx" ON "receipt_lines"("lotNumber");
CREATE INDEX "receipt_lines_expirationDate_idx" ON "receipt_lines"("expirationDate");

-- ─── receipt_scans ────────────────────────────────────────────
ALTER TABLE "receipt_scans" ADD COLUMN "lotNumber" TEXT;
ALTER TABLE "receipt_scans" ADD COLUMN "serialNumber" TEXT;
ALTER TABLE "receipt_scans" ADD COLUMN "expirationDate" TIMESTAMP(3);

CREATE INDEX "receipt_scans_lotNumber_idx" ON "receipt_scans"("lotNumber");
