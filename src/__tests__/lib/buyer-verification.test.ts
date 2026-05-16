/**
 * Tests for the buyer-verification state-machine helper in
 * `src/lib/buyer-verification.ts`. Pure functions — no DB.
 *
 * Covers the spec requirements:
 *   - Admin approves all required → retailer derives to VERIFIED
 *   - Admin rejects one required → retailer derives to REJECTED with reason
 *   - First upload from UNVERIFIED triggers PENDING_REVIEW transition flag
 */

import {
  REQUIRED_DOCUMENT_TYPES,
  deriveRetailerVerification,
  shouldFlipToPendingOnUpload,
  isRequiredType,
  type DocumentForDerivation,
} from '@/lib/buyer-verification';

// ─── Fixtures ───

function doc(
  overrides: Partial<DocumentForDerivation> = {},
): DocumentForDerivation {
  return {
    type: 'RESALE_CERTIFICATE',
    status: 'PENDING',
    rejectReason: null,
    createdAt: new Date('2026-04-01T12:00:00Z'),
    ...overrides,
  };
}

function approvedAll(): DocumentForDerivation[] {
  return [
    doc({ type: 'RESALE_CERTIFICATE', status: 'APPROVED' }),
    doc({ type: 'EIN_LETTER', status: 'APPROVED' }),
    doc({ type: 'TOBACCO_LICENSE', status: 'APPROVED' }),
  ];
}

// ─── REQUIRED_DOCUMENT_TYPES ───

describe('REQUIRED_DOCUMENT_TYPES', () => {
  it('lists the three regulatory-required types', () => {
    expect([...REQUIRED_DOCUMENT_TYPES]).toEqual([
      'RESALE_CERTIFICATE',
      'EIN_LETTER',
      'TOBACCO_LICENSE',
    ]);
  });
});

describe('isRequiredType', () => {
  it('flags required types as required', () => {
    expect(isRequiredType('RESALE_CERTIFICATE')).toBe(true);
    expect(isRequiredType('EIN_LETTER')).toBe(true);
    expect(isRequiredType('TOBACCO_LICENSE')).toBe(true);
  });

  it('flags optional types as not required', () => {
    expect(isRequiredType('STATE_BUSINESS_LICENSE')).toBe(false);
    expect(isRequiredType('AGE_VERIFICATION')).toBe(false);
    expect(isRequiredType('OTHER')).toBe(false);
  });
});

// ─── deriveRetailerVerification ───

describe('deriveRetailerVerification', () => {
  it('returns UNVERIFIED for an empty document set', () => {
    expect(deriveRetailerVerification([])).toEqual({
      status: 'UNVERIFIED',
      rejectReason: null,
    });
  });

  it('returns PENDING_REVIEW when at least one document exists but no required type is fully approved', () => {
    const result = deriveRetailerVerification([
      doc({ type: 'RESALE_CERTIFICATE', status: 'PENDING' }),
    ]);
    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.rejectReason).toBeNull();
  });

  it('returns VERIFIED when every required type has at least one APPROVED row', () => {
    expect(deriveRetailerVerification(approvedAll())).toEqual({
      status: 'VERIFIED',
      rejectReason: null,
    });
  });

  it('returns PENDING_REVIEW when only two of three required types are approved', () => {
    const result = deriveRetailerVerification([
      doc({ type: 'RESALE_CERTIFICATE', status: 'APPROVED' }),
      doc({ type: 'EIN_LETTER', status: 'APPROVED' }),
      doc({ type: 'TOBACCO_LICENSE', status: 'PENDING' }),
    ]);
    expect(result.status).toBe('PENDING_REVIEW');
  });

  it('returns REJECTED when any required type latest is REJECTED, surfacing its reason', () => {
    const result = deriveRetailerVerification([
      doc({ type: 'RESALE_CERTIFICATE', status: 'APPROVED' }),
      doc({ type: 'EIN_LETTER', status: 'APPROVED' }),
      doc({
        type: 'TOBACCO_LICENSE',
        status: 'REJECTED',
        rejectReason: 'License is expired (2024-12).',
      }),
    ]);
    expect(result.status).toBe('REJECTED');
    expect(result.rejectReason).toBe('License is expired (2024-12).');
  });

  it('returns REJECTED with a sensible default reason when REJECTED but no reason recorded', () => {
    const result = deriveRetailerVerification([
      doc({
        type: 'TOBACCO_LICENSE',
        status: 'REJECTED',
        rejectReason: null,
      }),
    ]);
    expect(result.status).toBe('REJECTED');
    expect(result.rejectReason).toContain('TOBACCO_LICENSE');
  });

  it('uses the LATEST document per required type — a rejection healed by a later approval flips back', () => {
    // Original cert was rejected, retailer re-uploaded a clean copy that
    // was then approved. The retailer should derive to VERIFIED.
    const result = deriveRetailerVerification([
      doc({
        type: 'RESALE_CERTIFICATE',
        status: 'APPROVED',
        createdAt: new Date('2026-04-10T00:00:00Z'),
      }),
      doc({
        type: 'RESALE_CERTIFICATE',
        status: 'REJECTED',
        rejectReason: 'Old reason',
        createdAt: new Date('2026-04-01T00:00:00Z'),
      }),
      doc({
        type: 'EIN_LETTER',
        status: 'APPROVED',
        createdAt: new Date('2026-04-05T00:00:00Z'),
      }),
      doc({
        type: 'TOBACCO_LICENSE',
        status: 'APPROVED',
        createdAt: new Date('2026-04-05T00:00:00Z'),
      }),
    ]);
    expect(result.status).toBe('VERIFIED');
  });

  it('a fresh rejection on a previously-approved required type knocks the retailer back to REJECTED', () => {
    // The opposite of the heal case — admin re-reviews a stale cert and
    // rejects it (suspecting forgery). The retailer must drop to REJECTED.
    const result = deriveRetailerVerification([
      doc({
        type: 'TOBACCO_LICENSE',
        status: 'REJECTED',
        rejectReason: 'License number does not match state registry.',
        createdAt: new Date('2026-04-20T00:00:00Z'),
      }),
      doc({
        type: 'TOBACCO_LICENSE',
        status: 'APPROVED',
        createdAt: new Date('2026-04-01T00:00:00Z'),
      }),
      doc({
        type: 'RESALE_CERTIFICATE',
        status: 'APPROVED',
        createdAt: new Date('2026-04-05T00:00:00Z'),
      }),
      doc({
        type: 'EIN_LETTER',
        status: 'APPROVED',
        createdAt: new Date('2026-04-05T00:00:00Z'),
      }),
    ]);
    expect(result.status).toBe('REJECTED');
    expect(result.rejectReason).toBe(
      'License number does not match state registry.',
    );
  });

  it('ignores optional types when deciding VERIFIED', () => {
    // An OTHER document being PENDING does not block VERIFIED status.
    const result = deriveRetailerVerification([
      ...approvedAll(),
      doc({ type: 'OTHER', status: 'PENDING' }),
    ]);
    expect(result.status).toBe('VERIFIED');
  });

  it('does not let a rejected OTHER doc force the retailer to REJECTED', () => {
    const result = deriveRetailerVerification([
      ...approvedAll(),
      doc({
        type: 'OTHER',
        status: 'REJECTED',
        rejectReason: 'Not relevant.',
      }),
    ]);
    expect(result.status).toBe('VERIFIED');
  });
});

// ─── shouldFlipToPendingOnUpload ───

describe('shouldFlipToPendingOnUpload', () => {
  it('flips an UNVERIFIED retailer to PENDING_REVIEW on first upload', () => {
    expect(shouldFlipToPendingOnUpload('UNVERIFIED')).toBe(true);
  });

  it('does not re-flip a retailer already PENDING_REVIEW', () => {
    expect(shouldFlipToPendingOnUpload('PENDING_REVIEW')).toBe(false);
  });

  it('does not flip a VERIFIED retailer', () => {
    expect(shouldFlipToPendingOnUpload('VERIFIED')).toBe(false);
  });

  it('does not flip a REJECTED retailer (admin must re-review the doc)', () => {
    // A rejected retailer who uploads a fresh document does not
    // auto-flip to PENDING_REVIEW — the per-document review still
    // re-derives the retailer status, so the new document being PENDING
    // alongside an existing REJECTED required doc keeps the retailer at
    // REJECTED until that document is itself reviewed. This matches the
    // derivation logic.
    expect(shouldFlipToPendingOnUpload('REJECTED')).toBe(false);
  });
});
