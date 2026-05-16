import { Prisma } from '@prisma/client';
import {
  csvImportRowSchema,
  type CsvImportRow,
  CSV_IMPORT_MAX_ROWS,
} from '@/lib/validators';

/**
 * Catalog CSV bulk-import — pure planning logic.
 *
 * `validateAndPlanImport(rows, existing)` is the heart of
 * `POST /api/wholesaler/products/import`. It:
 *
 *   1. Re-runs Zod over each row (defence in depth — the route handler
 *      already validates the whole payload, but we want this helper safe
 *      to call from any context).
 *   2. Detects duplicate SKUs *within the upload itself* — re-uploading
 *      the same SKU twice in a 5000-row file is almost always a copy/paste
 *      mistake and we surface it as a row error.
 *   3. Caps the row count at `CSV_IMPORT_MAX_ROWS` (5000).
 *   4. Joins each row against the caller's existing-product lookup, picks
 *      whether to **create** a new `Product` or **upsert** a
 *      `ProductPricing` against an already-known `Product`, and resolves
 *      a category id from a (categoryId → name → null) priority chain.
 *
 * The function is sync, has no DB or HTTP dependencies, and returns a
 * fully realised plan: the route handler then iterates `toCreate` /
 * `toUpsert` inside `prisma.$transaction`. Anything load-bearing belongs
 * in this file so the route stays a thin transactional wrapper.
 *
 * The exported types deliberately mirror Prisma's `*CreateInput` shape so
 * a future refactor can hand them straight to `tx.product.create({ data })`
 * without further mapping. We avoid `any` everywhere — see `Prisma.Decimal`
 * for money math; the return shape is what the route handler consumes.
 */

/** Result of looking up a `Category` by either `categoryId` or `name`. */
export interface CategoryLookup {
  /** Internal Prisma cuid (`Category.id`) — what the FK actually stores. */
  id: string;
  /** Human-friendly id like `CAT001` — first lookup priority. */
  categoryId: string;
  /** Display name — second lookup priority (case-insensitive). */
  name: string;
}

/** Minimum shape of a pre-loaded `Product` row the planner cares about. */
export interface ExistingProduct {
  /** Internal cuid. */
  id: string;
  /** Unique sku — the lookup key. */
  sku: string;
}

/** Pre-loaded `ProductPricing` rows for `(productId, wholesalerId)` join. */
export interface ExistingPricing {
  productId: string;
  wholesalerId: string;
}

export interface ImportContext {
  /** The wholesaler this upload belongs to. Every `ProductPricing` row
   *  the planner emits is keyed to this id. */
  wholesalerId: string;
  /** All existing products keyed by sku (lower-case keys). The route
   *  handler builds this with one `Product.findMany({ where: { sku: { in } } })`
   *  before calling the planner. */
  existingProductsBySku: Map<string, ExistingProduct>;
  /** All existing pricings for *this wholesaler* keyed by productId. */
  existingPricingsByProductId: Map<string, ExistingPricing>;
  /** All categories keyed twice — once by `categoryId` (`CAT001`...) and
   *  once by lower-cased `name` — so the planner can resolve in O(1). */
  categoriesByCategoryId: Map<string, CategoryLookup>;
  categoriesByLowerName: Map<string, CategoryLookup>;
}

/** A row that resolves to "create a new Product *and* attach pricing". */
export interface PlannedCreate {
  /** Original 0-based row index from the upload — useful for error reports. */
  rowIndex: number;
  /** Pre-validated row data. */
  row: CsvImportRow;
  /** Resolved internal `Category.id` (cuid) — null when the row's category
   *  string didn't match any existing category, or no category was given. */
  categoryId: string | null;
}

/** A row that resolves to "Product already exists — upsert pricing only". */
export interface PlannedUpsert {
  rowIndex: number;
  row: CsvImportRow;
  /** Cuid of the existing `Product` we'll attach pricing to. */
  existingProductId: string;
  /** True when a `ProductPricing` row already exists for this seller — the
   *  route handler will `update` instead of `create`. */
  hasExistingPricing: boolean;
  /** Same shape as `PlannedCreate.categoryId`. Only consulted by the
   *  route when it's also patching the Product's category — the default
   *  behaviour is to leave existing Product fields untouched and only
   *  write the pricing. */
  categoryId: string | null;
}

/** A row that failed validation or violated an upload-level invariant. */
export interface ImportRowError {
  /** 0-based index from the upload — easier to grep than 1-based. */
  rowIndex: number;
  /** May be undefined for rows where Zod failed to parse the sku itself. */
  sku?: string;
  /** Stable code the UI / API client can branch on. */
  code:
    | 'INVALID_ROW'
    | 'DUPLICATE_SKU_IN_UPLOAD'
    | 'TOO_MANY_ROWS';
  /** Human-readable detail. Don't pattern-match on this. */
  message: string;
}

export interface ImportPlan {
  toCreate: PlannedCreate[];
  toUpsert: PlannedUpsert[];
  errors: ImportRowError[];
}

/** Lower-case a string with a single rule that's always Unicode-safe. */
function lower(s: string): string {
  return s.toLocaleLowerCase();
}

/**
 * Resolve a `categoryId` cuid for a row's `category` field. Priority is
 * **exact `categoryId` match** first (because `CAT001` is unambiguous and
 * cheaper), then **case-insensitive name match**. Unknown values resolve
 * to `null`; the planner never invents new categories — that's an admin
 * job per the task spec.
 */
function resolveCategoryId(
  category: string | undefined,
  ctx: ImportContext,
): string | null {
  if (!category) return null;
  const trimmed = category.trim();
  if (trimmed.length === 0) return null;

  const byId = ctx.categoriesByCategoryId.get(trimmed);
  if (byId) return byId.id;

  const byName = ctx.categoriesByLowerName.get(lower(trimmed));
  if (byName) return byName.id;

  return null;
}

/**
 * Validate every row and produce a create/upsert plan.
 *
 * Behaviour summary:
 *   - **Row-shape errors** are collected per-row; each carries its
 *     `rowIndex` (0-based) and the offending `sku` if available. The
 *     route handler turns the full error list into a single 400 — no
 *     partial commits.
 *   - **Duplicate SKUs in the same upload** are reported on the
 *     **second-and-later occurrence** so the report tells the user
 *     which row to fix. The first occurrence still goes through normal
 *     create/upsert routing — but because the route handler treats *any*
 *     errors as a 400, the first occurrence will never actually persist.
 *   - **Row-count overflow** (> CSV_IMPORT_MAX_ROWS) produces one
 *     `TOO_MANY_ROWS` error at index 0 with no row-shape evaluation.
 *   - **Category resolution** is best-effort: a row with an unknown
 *     category still imports, with `categoryId = null`. Stricter
 *     handling would force wholesalers to wait on admin category
 *     creation before they can list inventory at all.
 */
export function validateAndPlanImport(
  rawRows: unknown[],
  ctx: ImportContext,
): ImportPlan {
  const errors: ImportRowError[] = [];
  const toCreate: PlannedCreate[] = [];
  const toUpsert: PlannedUpsert[] = [];

  if (rawRows.length > CSV_IMPORT_MAX_ROWS) {
    errors.push({
      rowIndex: 0,
      code: 'TOO_MANY_ROWS',
      message: `Upload has ${rawRows.length} rows; the limit is ${CSV_IMPORT_MAX_ROWS}.`,
    });
    return { toCreate, toUpsert, errors };
  }

  // Track SKUs seen so far to flag duplicates in this upload. We compare
  // case-sensitively because the schema's unique constraint is also
  // case-sensitive — `SKU-1` and `sku-1` would coexist in the DB today
  // and our planner shouldn't artificially merge them.
  const seenSku = new Set<string>();

  for (let i = 0; i < rawRows.length; i++) {
    const parsed = csvImportRowSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      // Surface the Zod field error count compactly. The full Zod
      // payload is available to the route handler if it wants more
      // detail — we prefer a stable summary for log grep.
      const fieldErrors = Object.entries(flat.fieldErrors)
        .map(([k, v]) => `${k}: ${(v ?? []).join(', ')}`)
        .join('; ');
      errors.push({
        rowIndex: i,
        sku:
          typeof (rawRows[i] as Record<string, unknown> | null | undefined)?.sku ===
          'string'
            ? ((rawRows[i] as { sku: string }).sku)
            : undefined,
        code: 'INVALID_ROW',
        message: fieldErrors || 'Row failed validation',
      });
      continue;
    }

    const row = parsed.data;

    if (seenSku.has(row.sku)) {
      errors.push({
        rowIndex: i,
        sku: row.sku,
        code: 'DUPLICATE_SKU_IN_UPLOAD',
        message: `sku '${row.sku}' appears more than once in this upload.`,
      });
      continue;
    }
    seenSku.add(row.sku);

    const categoryId = resolveCategoryId(row.category, ctx);

    const existingProduct = ctx.existingProductsBySku.get(row.sku);
    if (existingProduct) {
      toUpsert.push({
        rowIndex: i,
        row,
        existingProductId: existingProduct.id,
        hasExistingPricing: ctx.existingPricingsByProductId.has(
          existingProduct.id,
        ),
        categoryId,
      });
    } else {
      toCreate.push({ rowIndex: i, row, categoryId });
    }
  }

  return { toCreate, toUpsert, errors };
}

/**
 * Convert a JS number money value to `Prisma.Decimal` rounded to 2 places.
 * Money math must never round-trip through `Number(...)` — see CLAUDE.md
 * "Money math is Decimal." Exposed for the route handler so the conversion
 * happens exactly once, at the boundary.
 *
 * Rounding mode is `ROUND_HALF_UP` (the financial-default) — `1.005` →
 * `1.01`. Note that JS `(1.005).toFixed(2)` returns `'1.00'` because
 * `1.005` cannot be represented exactly in IEEE 754; we route through
 * Prisma.Decimal first so the rounding sees the actual decimal value the
 * caller wrote.
 */
export function toMoney(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

/**
 * Build the `Prisma.ProductCreateInput` for a `PlannedCreate` row. Stays a
 * pure function for testability — no dependency on prisma, no random or
 * time-dependent fields except `productId` (which the caller may override
 * for a deterministic test). The route handler uses it once per row inside
 * its `$transaction`.
 */
export function buildProductCreateInput(
  plan: PlannedCreate,
  options: { productId: string },
): Prisma.ProductCreateInput {
  const r = plan.row;
  const data: Prisma.ProductCreateInput = {
    productId: options.productId,
    sku: r.sku,
    name: r.name,
    ageRestricted: r.ageRestricted,
  };

  if (r.upc !== undefined) data.upcCode = r.upc;
  if (r.brand !== undefined) data.brand = r.brand;
  if (r.description !== undefined) data.description = r.description;
  if (r.unitsPerCase !== undefined) data.unitsPerCase = r.unitsPerCase;
  if (r.weightLbs !== undefined) data.weightLbs = toMoney(r.weightLbs);
  if (plan.categoryId !== null) {
    data.category = { connect: { id: plan.categoryId } };
  }

  return data;
}

/**
 * Build the create-side payload for a new `ProductPricing` row paired with
 * a freshly-created Product. The route handler nests this under
 * `Product.create({ data: { ..., pricings: { create: [...] } } })`.
 *
 * Uses the checked Prisma input variant (`wholesaler: { connect }`) so
 * referential integrity is enforced by Prisma; the unchecked variant would
 * accept a wholesalerId for a non-existent wholesaler and surface as a
 * runtime FK error inside the transaction.
 */
export function buildPricingCreateNestedInput(
  row: CsvImportRow,
  wholesalerId: string,
): Prisma.ProductPricingCreateWithoutProductInput {
  return {
    wholesaler: { connect: { id: wholesalerId } },
    wholesalePrice: toMoney(row.wholesalePrice),
    msrp: row.msrp !== undefined ? toMoney(row.msrp) : null,
    minimumOrderQty: row.minimumOrderQty,
    caseQty: row.caseQty ?? null,
  };
}

/**
 * Build the (create | update) payload for a `ProductPricing` upsert when
 * the parent Product already exists. The route handler hands this to
 * `tx.productPricing.upsert({ where: ..., update, create })`.
 */
export function buildPricingUpsertInput(
  row: CsvImportRow,
  productId: string,
  wholesalerId: string,
): {
  where: Prisma.ProductPricingWhereUniqueInput;
  create: Prisma.ProductPricingCreateInput;
  update: Prisma.ProductPricingUpdateInput;
} {
  const wholesalePrice = toMoney(row.wholesalePrice);
  const msrp = row.msrp !== undefined ? toMoney(row.msrp) : null;
  return {
    where: {
      productId_wholesalerId: { productId, wholesalerId },
    },
    create: {
      product: { connect: { id: productId } },
      wholesaler: { connect: { id: wholesalerId } },
      wholesalePrice,
      msrp,
      minimumOrderQty: row.minimumOrderQty,
      caseQty: row.caseQty ?? null,
    },
    update: {
      wholesalePrice,
      msrp,
      minimumOrderQty: row.minimumOrderQty,
      caseQty: row.caseQty ?? null,
    },
  };
}

/** Re-export so callers don't need to know the validator file too. */
export { csvImportRowSchema, CSV_IMPORT_MAX_ROWS };
export type { CsvImportRow };
