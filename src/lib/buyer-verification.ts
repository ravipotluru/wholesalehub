import type { BuyerDocumentStatus, BuyerDocumentType, VerificationStatus } from '@prisma/client';

/**
 * Buyer-verification state-machine helpers.
 *
 * The retailer-level `verificationStatus` is *derived* from the set of
 * `BuyerDocument` rows for that retailer. This file holds the pure logic
 * so the route handlers and the unit tests share one source of truth.
 *
 * Required document types — every one must be APPROVED for the retailer
 * to flip to VERIFIED. Anything REJECTED among these flips the retailer
 * to REJECTED.
 *
 * Optional types (STATE_BUSINESS_LICENSE / AGE_VERIFICATION / OTHER) are
 * supporting evidence that admins may request situationally; they do not
 * block VERIFIED on their own and a rejection on an OTHER document does
 * not auto-reject the retailer.
 */

export const REQUIRED_DOCUMENT_TYPES = [
  'RESALE_CERTIFICATE',
  'EIN_LETTER',
  'TOBACCO_LICENSE',
] as const satisfies ReadonlyArray<BuyerDocumentType>;

export type RequiredDocumentType = (typeof REQUIRED_DOCUMENT_TYPES)[number];

export interface DocumentLike {
  type: BuyerDocumentType;
  status: BuyerDocumentStatus;
  rejectReason?: string | null;
}

/**
 * Compute the retailer's overall verification status from their documents.
 *
 * Decision tree (in priority order):
 *   1. If any required-type doc has `status === REJECTED` → REJECTED.
 *      The first rejection's `rejectReason` is surfaced as the retailer-
 *      level reason.
 *   2. If every required type has at least one APPROVED doc → VERIFIED.
 *   3. If at least one document exists at all → PENDING_REVIEW.
 *   4. Otherwise → UNVERIFIED (no docs uploaded yet).
 *
 * The function is intentionally permissive about *extra* documents — a
 * retailer who uploads two RESALE_CERTIFICATE rows (e.g. the first was
 * rejected, they uploaded a fresh one that's now APPROVED) is treated as
 * having that requirement satisfied, since rejection #1 is no longer the
 * latest state for that type. We use "at least one APPROVED per required
 * type" rather than "no rejections" so a re-upload after a fix can heal
 * the retailer back to VERIFIED.
 *
 * BUT — if the *latest* document for a required type is REJECTED, the
 * retailer is REJECTED. Callers ensure caller passes the full document
 * history so we can resolve "latest per type" deterministically by
 * `createdAt` order. (Tests cover this.)
 */
export interface DerivedVerification {
  status: VerificationStatus;
  /** Reason text when status === REJECTED, otherwise null. */
  rejectReason: string | null;
}

export interface DocumentForDerivation extends DocumentLike {
  createdAt: Date;
}

export function deriveRetailerVerification(
  documents: ReadonlyArray<DocumentForDerivation>,
): DerivedVerification {
  if (documents.length === 0) {
    return { status: 'UNVERIFIED', rejectReason: null };
  }

  // Resolve the latest document of each required type.
  const latestByRequiredType = new Map<RequiredDocumentType, DocumentForDerivation>();
  for (const requiredType of REQUIRED_DOCUMENT_TYPES) {
    const ofType = documents
      .filter((d) => d.type === requiredType)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (ofType[0]) latestByRequiredType.set(requiredType, ofType[0]);
  }

  // Step 1: rejection on the latest copy of any required type → REJECTED.
  for (const requiredType of REQUIRED_DOCUMENT_TYPES) {
    const latest = latestByRequiredType.get(requiredType);
    if (latest && latest.status === 'REJECTED') {
      return {
        status: 'REJECTED',
        rejectReason:
          latest.rejectReason ?? `${requiredType} document was rejected.`,
      };
    }
  }

  // Step 2: every required type has at least one APPROVED row → VERIFIED.
  const everyRequiredApproved = REQUIRED_DOCUMENT_TYPES.every((type) =>
    documents.some((d) => d.type === type && d.status === 'APPROVED'),
  );
  if (everyRequiredApproved) {
    return { status: 'VERIFIED', rejectReason: null };
  }

  // Step 3: at least one doc exists → PENDING_REVIEW.
  return { status: 'PENDING_REVIEW', rejectReason: null };
}

/**
 * Should an UNVERIFIED retailer auto-flip to PENDING_REVIEW when they
 * upload a new document? Yes — that's the spec. Centralised here so the
 * upload route doesn't reach into transition rules.
 */
export function shouldFlipToPendingOnUpload(current: VerificationStatus): boolean {
  return current === 'UNVERIFIED';
}

/**
 * Should the retailer's status be recomputed when an admin reviews a
 * document? Always yes — the document review is the only path that flips
 * the retailer to VERIFIED or REJECTED. The actual flip uses
 * `deriveRetailerVerification`.
 */
export function isRequiredType(type: BuyerDocumentType): type is RequiredDocumentType {
  return (REQUIRED_DOCUMENT_TYPES as ReadonlyArray<BuyerDocumentType>).includes(type);
}
