/**
 * Catalog import — pure-function tests.
 *
 * Tests for `src/lib/catalog-import.ts`:
 *   - row validation (delegated to Zod, but the planner enforces order)
 *   - duplicate-sku detection within a single upload
 *   - row-count cap (CSV_IMPORT_MAX_ROWS = 5000)
 *   - category lookup priority (categoryId then name, case-insensitive)
 *   - create-vs-upsert routing based on existing-product lookup
 *   - the small payload-builder helpers that turn rows into Prisma input
 */

import { Prisma } from '@prisma/client';
import {
  validateAndPlanImport,
  buildProductCreateInput,
  buildPricingCreateNestedInput,
  buildPricingUpsertInput,
  toMoney,
  CSV_IMPORT_MAX_ROWS,
  type CategoryLookup,
  type ExistingPricing,
  type ExistingProduct,
  type ImportContext,
  type CsvImportRow,
} from '@/lib/catalog-import';

// ─── Fixtures ───

function makeRow(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    sku: 'SKU-1',
    name: 'Test Vape',
    wholesalePrice: 9.99,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    wholesalerId: 'ws-1',
    existingProductsBySku: new Map<string, ExistingProduct>(),
    existingPricingsByProductId: new Map<string, ExistingPricing>(),
    categoriesByCategoryId: new Map<string, CategoryLookup>(),
    categoriesByLowerName: new Map<string, CategoryLookup>(),
    ...overrides,
  };
}

function category(
  id: string,
  categoryId: string,
  name: string,
): CategoryLookup {
  return { id, categoryId, name };
}

// ─── validateAndPlanImport — happy paths ───

describe('validateAndPlanImport — basic routing', () => {
  it('routes a brand-new sku to toCreate', () => {
    const plan = validateAndPlanImport([makeRow()], makeCtx());
    expect(plan.errors).toEqual([]);
    expect(plan.toUpsert).toEqual([]);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].rowIndex).toBe(0);
    expect(plan.toCreate[0].row.sku).toBe('SKU-1');
  });

  it('routes an existing sku to toUpsert', () => {
    const ctx = makeCtx({
      existingProductsBySku: new Map([
        ['SKU-1', { id: 'prod-cuid-1', sku: 'SKU-1' }],
      ]),
    });
    const plan = validateAndPlanImport([makeRow()], ctx);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpsert).toHaveLength(1);
    expect(plan.toUpsert[0].existingProductId).toBe('prod-cuid-1');
    expect(plan.toUpsert[0].hasExistingPricing).toBe(false);
  });

  it('flags hasExistingPricing when the wholesaler already has a pricing row', () => {
    const ctx = makeCtx({
      existingProductsBySku: new Map([
        ['SKU-1', { id: 'prod-cuid-1', sku: 'SKU-1' }],
      ]),
      existingPricingsByProductId: new Map([
        ['prod-cuid-1', { productId: 'prod-cuid-1', wholesalerId: 'ws-1' }],
      ]),
    });
    const plan = validateAndPlanImport([makeRow()], ctx);
    expect(plan.toUpsert[0].hasExistingPricing).toBe(true);
  });

  it('keeps create + upsert bucketing across a mixed batch', () => {
    const ctx = makeCtx({
      existingProductsBySku: new Map([
        ['EXISTS-A', { id: 'prod-a', sku: 'EXISTS-A' }],
      ]),
    });
    const plan = validateAndPlanImport(
      [
        makeRow({ sku: 'NEW-1' }),
        makeRow({ sku: 'EXISTS-A' }),
        makeRow({ sku: 'NEW-2' }),
      ],
      ctx,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.toCreate.map((c) => c.row.sku)).toEqual(['NEW-1', 'NEW-2']);
    expect(plan.toUpsert.map((u) => u.row.sku)).toEqual(['EXISTS-A']);
    // rowIndex is preserved across both buckets
    expect(plan.toCreate[0].rowIndex).toBe(0);
    expect(plan.toUpsert[0].rowIndex).toBe(1);
    expect(plan.toCreate[1].rowIndex).toBe(2);
  });
});

// ─── validateAndPlanImport — validation errors ───

describe('validateAndPlanImport — invalid rows', () => {
  it('rejects a row with no sku', () => {
    const plan = validateAndPlanImport(
      [{ name: 'no-sku', wholesalePrice: 1 }],
      makeCtx(),
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpsert).toEqual([]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].code).toBe('INVALID_ROW');
    expect(plan.errors[0].rowIndex).toBe(0);
    expect(plan.errors[0].sku).toBeUndefined();
  });

  it('rejects a row with wholesalePrice <= 0', () => {
    const plan = validateAndPlanImport([makeRow({ wholesalePrice: 0 })], makeCtx());
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].code).toBe('INVALID_ROW');
    expect(plan.errors[0].sku).toBe('SKU-1');
    expect(plan.errors[0].message).toContain('wholesalePrice');
  });

  it('rejects a name longer than 200 chars', () => {
    const plan = validateAndPlanImport(
      [makeRow({ name: 'A'.repeat(201) })],
      makeCtx(),
    );
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].code).toBe('INVALID_ROW');
  });

  it('rejects a description longer than 2000 chars', () => {
    const plan = validateAndPlanImport(
      [makeRow({ description: 'X'.repeat(2001) })],
      makeCtx(),
    );
    expect(plan.errors).toHaveLength(1);
  });

  it('rejects a non-integer minimumOrderQty', () => {
    const plan = validateAndPlanImport(
      [makeRow({ minimumOrderQty: 1.5 })],
      makeCtx(),
    );
    expect(plan.errors).toHaveLength(1);
  });

  it('rejects unknown fields in strict mode', () => {
    const plan = validateAndPlanImport(
      [makeRow({ ohnoUnknown: 'value' })],
      makeCtx(),
    );
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].code).toBe('INVALID_ROW');
  });

  it('captures the sku in the error report when Zod parsed it', () => {
    const plan = validateAndPlanImport(
      [makeRow({ sku: 'BAD-PRICE-SKU', wholesalePrice: -5 })],
      makeCtx(),
    );
    expect(plan.errors[0].sku).toBe('BAD-PRICE-SKU');
  });

  it('continues evaluating later rows even when an earlier row errors', () => {
    const plan = validateAndPlanImport(
      [
        makeRow({ sku: 'GOOD-1' }),
        makeRow({ sku: 'BAD-1', wholesalePrice: 0 }),
        makeRow({ sku: 'GOOD-2' }),
      ],
      makeCtx(),
    );
    // The route handler will still 400 the whole upload — but the planner
    // returns a complete report so the client UI can highlight every row.
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].rowIndex).toBe(1);
    expect(plan.toCreate.map((c) => c.row.sku)).toEqual(['GOOD-1', 'GOOD-2']);
  });
});

// ─── validateAndPlanImport — duplicate sku within upload ───

describe('validateAndPlanImport — duplicate skus in same upload', () => {
  it('flags the second occurrence with DUPLICATE_SKU_IN_UPLOAD', () => {
    const plan = validateAndPlanImport(
      [
        makeRow({ sku: 'DUP-1' }),
        makeRow({ sku: 'DUP-1' }),
      ],
      makeCtx(),
    );
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].code).toBe('DUPLICATE_SKU_IN_UPLOAD');
    expect(plan.errors[0].rowIndex).toBe(1);
    expect(plan.errors[0].sku).toBe('DUP-1');
  });

  it('flags every duplicate after the first occurrence', () => {
    const plan = validateAndPlanImport(
      [
        makeRow({ sku: 'DUP-1' }),
        makeRow({ sku: 'DUP-1' }),
        makeRow({ sku: 'DUP-1' }),
      ],
      makeCtx(),
    );
    expect(plan.errors).toHaveLength(2);
    expect(plan.errors.every((e) => e.code === 'DUPLICATE_SKU_IN_UPLOAD')).toBe(
      true,
    );
    expect(plan.errors.map((e) => e.rowIndex)).toEqual([1, 2]);
  });

  it('treats duplicate detection as case-sensitive (matches DB unique constraint)', () => {
    const plan = validateAndPlanImport(
      [
        makeRow({ sku: 'sku-1' }),
        makeRow({ sku: 'SKU-1' }),
      ],
      makeCtx(),
    );
    expect(plan.errors).toEqual([]);
    expect(plan.toCreate).toHaveLength(2);
  });

  it('still creates the first occurrence — the route turns this into a 400 anyway', () => {
    // Documents the current contract: the planner's first-occurrence
    // result is informational only because the route handler 400s on
    // *any* errors and rolls back. This makes the response useful for
    // a client UI even though the data never persists.
    const plan = validateAndPlanImport(
      [
        makeRow({ sku: 'DUP-1' }),
        makeRow({ sku: 'DUP-1' }),
      ],
      makeCtx(),
    );
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.errors).toHaveLength(1);
  });
});

// ─── validateAndPlanImport — row count cap ───

describe('validateAndPlanImport — row count cap', () => {
  it('rejects a 5001-row upload with a single TOO_MANY_ROWS error', () => {
    const rows = Array.from({ length: CSV_IMPORT_MAX_ROWS + 1 }, (_, i) =>
      makeRow({ sku: `SKU-${i}` }),
    );
    const plan = validateAndPlanImport(rows, makeCtx());
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpsert).toEqual([]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].code).toBe('TOO_MANY_ROWS');
    expect(plan.errors[0].rowIndex).toBe(0);
    expect(plan.errors[0].message).toContain('5000');
  });

  it('accepts exactly CSV_IMPORT_MAX_ROWS rows', () => {
    // Use unique sku per row so we don't trip the duplicate-sku detector.
    const rows = Array.from({ length: CSV_IMPORT_MAX_ROWS }, (_, i) =>
      makeRow({ sku: `SKU-${i}` }),
    );
    const plan = validateAndPlanImport(rows, makeCtx());
    expect(plan.errors).toEqual([]);
    expect(plan.toCreate).toHaveLength(CSV_IMPORT_MAX_ROWS);
  });

  it('returns immediately on overflow without doing per-row validation', () => {
    // A single row beyond the cap that's *also* invalid still surfaces only
    // the TOO_MANY_ROWS error — overflow is the user's first problem.
    const rows: unknown[] = [
      ...Array.from({ length: CSV_IMPORT_MAX_ROWS }, (_, i) =>
        makeRow({ sku: `SKU-${i}` }),
      ),
      { sku: 'BAD', wholesalePrice: -1 },
    ];
    const plan = validateAndPlanImport(rows, makeCtx());
    expect(plan.errors.map((e) => e.code)).toEqual(['TOO_MANY_ROWS']);
  });
});

// ─── validateAndPlanImport — category resolution ───

describe('validateAndPlanImport — category lookup', () => {
  const tobacco = category('cuid-cat-1', 'CAT001', 'Tobacco');
  const glass = category('cuid-cat-2', 'CAT002', 'Glassware');

  function ctxWithCategories(): ImportContext {
    return makeCtx({
      categoriesByCategoryId: new Map([
        ['CAT001', tobacco],
        ['CAT002', glass],
      ]),
      categoriesByLowerName: new Map([
        ['tobacco', tobacco],
        ['glassware', glass],
      ]),
    });
  }

  it('resolves an exact categoryId match', () => {
    const plan = validateAndPlanImport(
      [makeRow({ category: 'CAT001' })],
      ctxWithCategories(),
    );
    expect(plan.toCreate[0].categoryId).toBe('cuid-cat-1');
  });

  it('resolves a case-insensitive name match when categoryId does not match', () => {
    const plan = validateAndPlanImport(
      [makeRow({ category: 'glassware' })],
      ctxWithCategories(),
    );
    expect(plan.toCreate[0].categoryId).toBe('cuid-cat-2');
  });

  it('matches a name with arbitrary case (TOBACCO, Tobacco, tobacco)', () => {
    for (const name of ['TOBACCO', 'Tobacco', 'tobacco', 'TobAccO']) {
      const plan = validateAndPlanImport(
        [makeRow({ category: name })],
        ctxWithCategories(),
      );
      expect(plan.toCreate[0].categoryId).toBe('cuid-cat-1');
    }
  });

  it('prefers categoryId over name when both could match different rows', () => {
    // Construct a context where the same string is a valid `categoryId`
    // for cat-X and a valid `name` for cat-Y — the planner must pick X.
    const dual: CategoryLookup = category('cuid-X', 'OVERLAP', 'irrelevant');
    const sameName: CategoryLookup = category('cuid-Y', 'CAT-OTHER', 'OVERLAP');
    const ctx = makeCtx({
      categoriesByCategoryId: new Map([
        ['OVERLAP', dual],
        ['CAT-OTHER', sameName],
      ]),
      categoriesByLowerName: new Map([
        ['irrelevant', dual],
        ['overlap', sameName],
      ]),
    });
    const plan = validateAndPlanImport(
      [makeRow({ category: 'OVERLAP' })],
      ctx,
    );
    // The categoryId lookup wins → cuid-X.
    expect(plan.toCreate[0].categoryId).toBe('cuid-X');
  });

  it('leaves categoryId null when nothing matches', () => {
    const plan = validateAndPlanImport(
      [makeRow({ category: 'Does-Not-Exist' })],
      ctxWithCategories(),
    );
    expect(plan.errors).toEqual([]);
    expect(plan.toCreate[0].categoryId).toBeNull();
  });

  it('leaves categoryId null when category is omitted', () => {
    const plan = validateAndPlanImport([makeRow()], ctxWithCategories());
    expect(plan.toCreate[0].categoryId).toBeNull();
  });

  it('treats whitespace-only category as missing', () => {
    const plan = validateAndPlanImport(
      [makeRow({ category: '   ' })],
      ctxWithCategories(),
    );
    expect(plan.toCreate[0].categoryId).toBeNull();
  });
});

// ─── Defaults ───

describe('validateAndPlanImport — defaults', () => {
  it('defaults ageRestricted to true when omitted', () => {
    const plan = validateAndPlanImport([makeRow()], makeCtx());
    expect(plan.toCreate[0].row.ageRestricted).toBe(true);
  });

  it('honours an explicit ageRestricted: false (e.g. CBD gummies)', () => {
    const plan = validateAndPlanImport(
      [makeRow({ ageRestricted: false })],
      makeCtx(),
    );
    expect(plan.toCreate[0].row.ageRestricted).toBe(false);
  });

  it('defaults minimumOrderQty to 1', () => {
    const plan = validateAndPlanImport([makeRow()], makeCtx());
    expect(plan.toCreate[0].row.minimumOrderQty).toBe(1);
  });
});

// ─── toMoney ───

describe('toMoney', () => {
  it('returns a Prisma.Decimal', () => {
    expect(toMoney(10)).toBeInstanceOf(Prisma.Decimal);
  });

  it('preserves whole-dollar amounts', () => {
    expect(toMoney(15).toString()).toBe('15');
  });

  it('caps at two decimal places', () => {
    // 9.999 has an unambiguous IEEE-754 representation that's
    // very close to 9.999, so Decimal.js + ROUND_HALF_UP rounds up to 10.
    expect(toMoney(9.999).toString()).toBe('10');
  });

  it('keeps two-decimal values intact', () => {
    expect(toMoney(9.99).toString()).toBe('9.99');
    expect(toMoney(15.5).toString()).toBe('15.5');
  });

  it('handles values that round down', () => {
    // 9.991 → IEEE-754 ≈ 9.991000... → rounds to 9.99
    expect(toMoney(9.991).toString()).toBe('9.99');
  });
});

// ─── buildProductCreateInput ───

describe('buildProductCreateInput', () => {
  function plannedFor(row: CsvImportRow, categoryId: string | null = null) {
    return { rowIndex: 0, row, categoryId };
  }

  function row(overrides: Partial<CsvImportRow> = {}): CsvImportRow {
    return {
      sku: 'SKU-1',
      name: 'Test',
      ageRestricted: true,
      wholesalePrice: 5,
      minimumOrderQty: 1,
      ...overrides,
    } as CsvImportRow;
  }

  function plain(value: unknown): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  it('builds a minimum-shape ProductCreateInput', () => {
    const input = buildProductCreateInput(plannedFor(row()), {
      productId: 'PRD-TEST-1',
    });
    const view = plain(input);
    expect(view).toMatchObject({
      productId: 'PRD-TEST-1',
      sku: 'SKU-1',
      name: 'Test',
      ageRestricted: true,
    });
    // Optional fields that weren't set should not be present, so Prisma's
    // generated input shape gets a clean object.
    expect('upcCode' in view).toBe(false);
    expect('brand' in view).toBe(false);
    expect('description' in view).toBe(false);
  });

  it('passes through optional product fields', () => {
    const input = buildProductCreateInput(
      plannedFor(
        row({
          upc: '012345',
          brand: 'Acme',
          description: 'a thing',
          unitsPerCase: 24,
          weightLbs: 1.5,
        }),
      ),
      { productId: 'PRD-X' },
    );
    const view = plain(input);
    expect(view.upcCode).toBe('012345');
    expect(view.brand).toBe('Acme');
    expect(view.description).toBe('a thing');
    expect(view.unitsPerCase).toBe(24);
    // weightLbs becomes a Decimal money-style value
    expect(String(view.weightLbs)).toBe('1.5');
  });

  it('connects category by Prisma id when present', () => {
    const input = buildProductCreateInput(plannedFor(row(), 'cuid-cat-1'), {
      productId: 'PRD-Y',
    });
    expect(plain(input).category).toEqual({ connect: { id: 'cuid-cat-1' } });
  });

  it('omits category when categoryId is null', () => {
    const input = buildProductCreateInput(plannedFor(row(), null), {
      productId: 'PRD-Z',
    });
    const view = plain(input);
    expect(view.category).toBeUndefined();
  });
});

// ─── buildPricingCreateNestedInput ───

describe('buildPricingCreateNestedInput', () => {
  function row(overrides: Partial<CsvImportRow> = {}): CsvImportRow {
    return {
      sku: 'SKU-1',
      name: 'Test',
      ageRestricted: true,
      wholesalePrice: 9.99,
      minimumOrderQty: 1,
      ...overrides,
    } as CsvImportRow;
  }

  it('builds a pricing payload that connects the wholesaler', () => {
    // We use the checked variant of the Prisma create input — the
    // wholesaler comes through as a `connect` relation, not a direct FK.
    const data = JSON.parse(
      JSON.stringify(buildPricingCreateNestedInput(row(), 'ws-9')),
    ) as Record<string, unknown>;
    expect(data.wholesaler).toEqual({ connect: { id: 'ws-9' } });
    expect(String(data.wholesalePrice)).toBe('9.99');
    expect(data.minimumOrderQty).toBe(1);
    expect(data.msrp).toBeNull();
    expect(data.caseQty).toBeNull();
  });

  it('passes msrp + caseQty through when provided', () => {
    const data = JSON.parse(
      JSON.stringify(
        buildPricingCreateNestedInput(row({ msrp: 15.99, caseQty: 12 }), 'ws-9'),
      ),
    ) as Record<string, unknown>;
    expect(String(data.msrp)).toBe('15.99');
    expect(data.caseQty).toBe(12);
  });
});

// ─── buildPricingUpsertInput ───

describe('buildPricingUpsertInput', () => {
  function row(overrides: Partial<CsvImportRow> = {}): CsvImportRow {
    return {
      sku: 'SKU-1',
      name: 'Test',
      ageRestricted: true,
      wholesalePrice: 9.99,
      minimumOrderQty: 1,
      ...overrides,
    } as CsvImportRow;
  }

  it('builds a where + create + update tuple keyed by (productId, wholesalerId)', () => {
    const args = buildPricingUpsertInput(row(), 'prod-1', 'ws-1');
    expect(args.where).toEqual({
      productId_wholesalerId: { productId: 'prod-1', wholesalerId: 'ws-1' },
    });
    // create connects both relations — read through JSON view because the
    // return type is the wide Prisma create union and direct property
    // access doesn't narrow across the function boundary.
    const createPlain = JSON.parse(JSON.stringify(args.create)) as Record<
      string,
      unknown
    >;
    expect(createPlain.product).toEqual({ connect: { id: 'prod-1' } });
    expect(createPlain.wholesaler).toEqual({ connect: { id: 'ws-1' } });
    // update only mutates pricing fields, not relations
    const updatePlain = JSON.parse(JSON.stringify(args.update)) as Record<
      string,
      unknown
    >;
    expect('product' in updatePlain).toBe(false);
    expect('wholesaler' in updatePlain).toBe(false);
  });

  it('refreshes price/qty fields on update', () => {
    const args = buildPricingUpsertInput(
      row({ wholesalePrice: 11, msrp: 19.99, caseQty: 6, minimumOrderQty: 3 }),
      'prod-1',
      'ws-1',
    );
    const updatePlain = JSON.parse(JSON.stringify(args.update)) as Record<
      string,
      unknown
    >;
    // toFixed(2) on 11 → '11.00' which Prisma.Decimal trims to '11'
    expect(String(updatePlain.wholesalePrice)).toBe('11');
    expect(String(updatePlain.msrp)).toBe('19.99');
    expect(updatePlain.caseQty).toBe(6);
    expect(updatePlain.minimumOrderQty).toBe(3);
  });

  it('emits Prisma.Decimal for money fields', () => {
    const args = buildPricingUpsertInput(row(), 'prod-1', 'ws-1');
    // Cast to a structural view so we can introspect the Decimal instance.
    const createView = args.create as unknown as {
      wholesalePrice: unknown;
    };
    expect(createView.wholesalePrice).toBeInstanceOf(Prisma.Decimal);
  });
});
