-- Buyer verification + multi-location ship-tos + wholesaler buyer approvals
-- + single-use auth tokens (email verification / password reset).
--
-- Hand-written (no local prisma CLI); mirrors what `prisma migrate dev` emits
-- for the schema.prisma in this commit. Additive only — no drops, no renames.

-- CreateEnum
CREATE TYPE "BuyerVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BuyerDocumentType" AS ENUM ('RESALE_CERTIFICATE', 'EIN_LETTER', 'TOBACCO_LICENSE', 'STATE_BUSINESS_LICENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "BuyerDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "BuyerApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "retailers" ADD COLUMN "verificationStatus" "BuyerVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';

-- CreateTable
CREATE TABLE "retailer_locations" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_documents" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "type" "BuyerDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSizeBytes" INTEGER,
    "status" "BuyerDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wholesaler_buyer_approvals" (
    "id" TEXT NOT NULL,
    "wholesalerId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "status" "BuyerApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "paymentTerms" TEXT,
    "requestReason" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wholesaler_buyer_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retailer_locations_retailerId_isActive_idx" ON "retailer_locations"("retailerId", "isActive");

-- CreateIndex
CREATE INDEX "buyer_documents_retailerId_type_createdAt_idx" ON "buyer_documents"("retailerId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "buyer_documents_status_createdAt_idx" ON "buyer_documents"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wholesaler_buyer_approvals_wholesalerId_retailerId_key" ON "wholesaler_buyer_approvals"("wholesalerId", "retailerId");

-- CreateIndex
CREATE INDEX "wholesaler_buyer_approvals_retailerId_status_idx" ON "wholesaler_buyer_approvals"("retailerId", "status");

-- CreateIndex
CREATE INDEX "wholesaler_buyer_approvals_wholesalerId_status_idx" ON "wholesaler_buyer_approvals"("wholesalerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_tokens_userId_type_idx" ON "auth_tokens"("userId", "type");

-- CreateIndex
CREATE INDEX "auth_tokens_expiresAt_idx" ON "auth_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "retailer_locations" ADD CONSTRAINT "retailer_locations_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_documents" ADD CONSTRAINT "buyer_documents_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesaler_buyer_approvals" ADD CONSTRAINT "wholesaler_buyer_approvals_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "wholesalers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesaler_buyer_approvals" ADD CONSTRAINT "wholesaler_buyer_approvals_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
