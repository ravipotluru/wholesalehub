import {
  inventoryWebhookSchema,
  productSearchSchema,
  stockStatusEnum,
} from '@/lib/validators';

describe('stockStatusEnum', () => {
  it('accepts every documented status, including BACKORDER', () => {
    for (const v of ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'BACKORDER']) {
      expect(stockStatusEnum.safeParse(v).success).toBe(true);
    }
  });

  it('rejects arbitrary strings', () => {
    expect(stockStatusEnum.safeParse('FOO').success).toBe(false);
    expect(stockStatusEnum.safeParse('').success).toBe(false);
  });
});

describe('productSearchSchema', () => {
  it('defaults sort to "relevance"', () => {
    const r = productSearchSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sort).toBe('relevance');
  });

  it('accepts the relevance sort option', () => {
    const r = productSearchSchema.safeParse({ sort: 'relevance' });
    expect(r.success).toBe(true);
  });

  it('rejects negative prices', () => {
    expect(productSearchSchema.safeParse({ minPrice: -1 }).success).toBe(false);
    expect(productSearchSchema.safeParse({ maxPrice: -1 }).success).toBe(false);
  });

  it('rejects ratings outside 0..5', () => {
    expect(productSearchSchema.safeParse({ minRating: 7 }).success).toBe(false);
    expect(productSearchSchema.safeParse({ minRating: -1 }).success).toBe(false);
  });

  it('rejects unknown stockStatus values', () => {
    expect(productSearchSchema.safeParse({ stockStatus: 'CHEAP' }).success).toBe(false);
  });
});

describe('inventoryWebhookSchema', () => {
  const minimalValid = {
    supplier_id: 'SUP-1',
    po_number: 'PO-123',
    line_items: [
      { sku: 'SKU-1', product_name: 'Widget', quantity: 5 },
    ],
  };

  it('accepts a valid payload', () => {
    const r = inventoryWebhookSchema.safeParse(minimalValid);
    expect(r.success).toBe(true);
  });

  it('requires either po_number or document_id', () => {
    const { po_number, ...rest } = minimalValid;
    void po_number;
    const r = inventoryWebhookSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it('accepts document_id alone', () => {
    const { po_number, ...rest } = minimalValid;
    void po_number;
    const r = inventoryWebhookSchema.safeParse({ ...rest, document_id: 'DOC-9' });
    expect(r.success).toBe(true);
  });

  it('rejects negative line item quantities', () => {
    const r = inventoryWebhookSchema.safeParse({
      ...minimalValid,
      line_items: [{ sku: 'SKU-1', product_name: 'X', quantity: -1 }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects payloads with unbounded line counts', () => {
    const tooMany = Array.from({ length: 10001 }, (_, i) => ({
      sku: `SKU-${i}`,
      product_name: 'X',
      quantity: 1,
    }));
    const r = inventoryWebhookSchema.safeParse({
      ...minimalValid,
      line_items: tooMany,
    });
    expect(r.success).toBe(false);
  });

  it('rejects malformed ship_date', () => {
    const r = inventoryWebhookSchema.safeParse({
      ...minimalValid,
      ship_date: 'not-a-date',
    });
    expect(r.success).toBe(false);
  });
});
