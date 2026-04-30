-- ============================================================
-- WholesaleHub: buyer verification flow
-- ============================================================
-- Adds the `BuyerDocument` table + verification fields on `Retailer`.
-- Drives the checkout gate on age-restricted SKUs (PACT Act / state
-- tobacco license compliance).
--
-- Hand-written because the worktree has no Postgres available for
-- `prisma migrate dev` to introspect against. Mirrors what Prisma
-- would emit for the schema diff.
-- ============================================================

-- 1. New enums --------------------------------------------------
CREATE TYPE "VerificationStatus" AS ENUM (
  'UNVERIFIED',
  'PENDING_REVIEW',
  'VERIFIED',
  'REJECTED'
);

CREATE TYPE "BuyerDocumentType" AS ENUM (
  'RESALE_CERTIFICATE',
  'EIN_LETTER',
  'TOBACCO_LICENSE',
  'STATE_BUSINESS_LICENSE',
  'AGE_VERIFICATION',
  'OTHER'
);

CREATE TYPE "BuyerDocumentStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

-- 2. Retailer additions -----------------------------------------
-- All columns are nullable or default-backed so the migration is
-- safe to run on a populated DB without a backfill step.
ALTER TABLE "retailers"
  ADD COLUMN "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "taxId" TEXT,
  ADD COLUMN "ein" TEXT,
  ADD COLUMN "resaleCertificate" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedBy" TEXT;

CREATE INDEX "retailers_verificationStatus_idx"
  ON "retailers" ("verificationStatus");

-- 3. BuyerDocument table ----------------------------------------
CREATE TABLE "buyer_documents" (
  "id"           TEXT NOT NULL,
  "retailerId"   TEXT NOT NULL,
  "type"         "BuyerDocumentType" NOT NULL,
  "status"       "BuyerDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "storageUrl"   TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "mimeType"     TEXT NOT NULL,
  "fileSizeKb"   INTEGER NOT NULL,
  "notes"        TEXT,
  "reviewedBy"   TEXT,
  "reviewedAt"   TIMESTAMP(3),
  "rejectReason" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "buyer_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "buyer_documents_retailerId_type_idx"
  ON "buyer_documents" ("retailerId", "type");

CREATE INDEX "buyer_documents_status_createdAt_idx"
  ON "buyer_documents" ("status", "createdAt");

ALTER TABLE "buyer_documents"
  ADD CONSTRAINT "buyer_documents_retailerId_fkey"
  FOREIGN KEY ("retailerId") REFERENCES "retailers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
