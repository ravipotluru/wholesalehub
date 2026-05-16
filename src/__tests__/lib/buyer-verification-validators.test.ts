/**
 * Buyer-verification Zod validator tests.
 *
 * Covers:
 *   - buyerDocumentUploadSchema (POST /api/buyer/documents body)
 *   - buyerDocumentReviewSchema (PATCH admin review body)
 *
 * The schema-level test the spec asks for ("BuyerDocument schema
 * validation") lives here — we exercise the Zod boundaries that the route
 * handler uses to reject malformed metadata before any DB write.
 */

import {
  buyerDocumentUploadSchema,
  buyerDocumentReviewSchema,
} from '@/lib/validators';

// ─── Upload schema ────────────────────────────────────────────────

describe('buyerDocumentUploadSchema', () => {
  const valid = {
    type: 'RESALE_CERTIFICATE' as const,
    fileName: 'resale-cert.pdf',
    mimeType: 'application/pdf',
    fileSizeKb: 250,
    storageUrl: 's3://wholesalehub-uploads/abc123.pdf',
  };

  it('accepts a valid upload payload', () => {
    const result = buyerDocumentUploadSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts every documented document type', () => {
    const types = [
      'RESALE_CERTIFICATE',
      'EIN_LETTER',
      'TOBACCO_LICENSE',
      'STATE_BUSINESS_LICENSE',
      'AGE_VERIFICATION',
      'OTHER',
    ];
    for (const type of types) {
      const result = buyerDocumentUploadSchema.safeParse({ ...valid, type });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unknown document type', () => {
    const result = buyerDocumentUploadSchema.safeParse({
      ...valid,
      type: 'PASSPORT',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty fileName', () => {
    const result = buyerDocumentUploadSchema.safeParse({ ...valid, fileName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects fileName longer than 255 chars', () => {
    const result = buyerDocumentUploadSchema.safeParse({
      ...valid,
      fileName: 'a'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty mimeType', () => {
    const result = buyerDocumentUploadSchema.safeParse({ ...valid, mimeType: '' });
    expect(result.success).toBe(false);
  });

  it('rejects fileSizeKb of zero', () => {
    const result = buyerDocumentUploadSchema.safeParse({ ...valid, fileSizeKb: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative fileSizeKb', () => {
    const result = buyerDocumentUploadSchema.safeParse({
      ...valid,
      fileSizeKb: -10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects fractional fileSizeKb', () => {
    const result = buyerDocumentUploadSchema.safeParse({
      ...valid,
      fileSizeKb: 250.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects fileSizeKb above the 50 MB cap', () => {
    const result = buyerDocumentUploadSchema.safeParse({
      ...valid,
      fileSizeKb: 60_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty storageUrl', () => {
    const result = buyerDocumentUploadSchema.safeParse({ ...valid, storageUrl: '' });
    expect(result.success).toBe(false);
  });

  it('accepts an https signed-URL form for storageUrl', () => {
    const result = buyerDocumentUploadSchema.safeParse({
      ...valid,
      storageUrl: 'https://uploads.example.com/abc?signature=xyz',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional notes', () => {
    const result = buyerDocumentUploadSchema.safeParse({
      ...valid,
      notes: 'Renewed cert as of April 2026.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects notes exceeding 1000 chars', () => {
    const result = buyerDocumentUploadSchema.safeParse({
      ...valid,
      notes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects when required field is missing', () => {
    const { type, ...rest } = valid;
    const result = buyerDocumentUploadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ─── Review schema ───────────────────────────────────────────────

describe('buyerDocumentReviewSchema', () => {
  it('accepts a plain APPROVE without rejectReason', () => {
    const result = buyerDocumentReviewSchema.safeParse({ action: 'APPROVE' });
    expect(result.success).toBe(true);
  });

  it('accepts APPROVE even when rejectReason is incidentally provided', () => {
    // Permissive — admin tools may always send rejectReason; we ignore it
    // for APPROVE actions in the route handler.
    const result = buyerDocumentReviewSchema.safeParse({
      action: 'APPROVE',
      rejectReason: 'ignored',
    });
    expect(result.success).toBe(true);
  });

  it('accepts REJECT with a non-empty rejectReason', () => {
    const result = buyerDocumentReviewSchema.safeParse({
      action: 'REJECT',
      rejectReason: 'Document is illegible.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects REJECT without a rejectReason', () => {
    const result = buyerDocumentReviewSchema.safeParse({ action: 'REJECT' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const reasonErr = result.error.issues.find((i) =>
        i.path.includes('rejectReason'),
      );
      expect(reasonErr).toBeDefined();
    }
  });

  it('rejects REJECT with an empty rejectReason', () => {
    const result = buyerDocumentReviewSchema.safeParse({
      action: 'REJECT',
      rejectReason: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown action', () => {
    const result = buyerDocumentReviewSchema.safeParse({ action: 'DEFER' });
    expect(result.success).toBe(false);
  });

  it('rejects rejectReason exceeding 1000 chars', () => {
    const result = buyerDocumentReviewSchema.safeParse({
      action: 'REJECT',
      rejectReason: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});
