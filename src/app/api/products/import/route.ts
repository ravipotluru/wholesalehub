import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { logger } from '@/lib/logger';

/**
 * POST /api/products/import — bulk catalog import behind the CSV wizard.
 *
 * Two modes on the same validation path:
 * - `dryRun: true`  → validate only, NO writes. Returns per-row errors
 *   (duplicate SKU in file, SKU collision with the existing catalog) and
 *   warnings (unknown category → product would be created uncategorised).
 * - `dryRun: false` → single transaction that creates a Product plus the
 *   caller-wholesaler's ProductPricing for every valid row. Errored rows
 *   are skipped and reported; valid rows commit.
 *
 * `rowIndex` in errors/warnings/skipped refers to the index within the
 * submitted `rows` array — the client maps it back to CSV line numbers.
 */

const importRowSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(64),
  upc: z.string().max(32).optional(),
  brand: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  price: z
    .string()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, 'Price must be a positive amount like 12.50'),
  caseQty: z.number().int().positive().max(2_147_483_647).optional(),
  moq: z.number().int().positive().max(2_147_483_647).optional(),
  stock: z.number().int().nonnegative().max(2_147_483_647).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  ageRestricted: z.boolean().optional(),
});

const importSchema = z.object({
  dryRun: z.boolean(),
  rows: z.array(importRowSchema).max(5000, 'At most 5,000 rows per import'),
});

type ImportRow = z.infer<typeof importRowSchema>;

interface RowIssue {
  rowIndex: number;
  sku: string;
  reason: string;
}

interface ValidationResult {
  errors: RowIssue[];
  warnings: RowIssue[];
  /** Rows that passed, with resolved categoryId (null = uncategorised). */
  valid: Array<{ rowIndex: number; row: ImportRow; categoryId: string | null }>;
}

/**
 * Shared validation pass (dry run + commit): in-file SKU dupes, catalog SKU
 * collisions (one findMany), case-insensitive category resolution. Reads
 * only — safe on either the root client or a transaction client.
 */
async function validateRows(
  db: Prisma.TransactionClient,
  rows: ImportRow[],
): Promise<ValidationResult> {
  const skus = rows.map((r) => r.sku);
  const categoryNames = Array.from(
    new Set(
      rows
        .map((r) => r.category?.trim().toLowerCase())
        .filter((c): c is string => !!c),
    ),
  );

  // Prisma treats `in: []` as an always-false filter, so empty inputs are
  // safe and both lookups stay a single query each.
  const [existingProducts, categories] = await Promise.all([
    db.product.findMany({
      where: { sku: { in: skus } },
      select: { sku: true },
    }),
    db.category.findMany({
      where: { name: { in: categoryNames, mode: 'insensitive' } },
      select: { id: true, name: true },
    }),
  ]);

  const existingSkus = new Set(existingProducts.map((p) => p.sku));
  const categoryIdByName = new Map(
    categories.map((c) => [c.name.toLowerCase(), c.id]),
  );

  const seenSkus = new Set<string>();
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const valid: ValidationResult['valid'] = [];

  rows.forEach((row, rowIndex) => {
    if (seenSkus.has(row.sku)) {
      errors.push({
        rowIndex,
        sku: row.sku,
        reason: 'Duplicate SKU within file — first occurrence kept',
      });
      return;
    }
    seenSkus.add(row.sku);

    if (existingSkus.has(row.sku)) {
      errors.push({
        rowIndex,
        sku: row.sku,
        reason: 'SKU already exists in the WholesaleHub catalog',
      });
      return;
    }

    let categoryId: string | null = null;
    const categoryName = row.category?.trim();
    if (categoryName) {
      categoryId = categoryIdByName.get(categoryName.toLowerCase()) ?? null;
      if (categoryId === null) {
        warnings.push({
          rowIndex,
          sku: row.sku,
          reason: `Unknown category "${categoryName}" — product will be imported without a category`,
        });
      }
    }

    valid.push({ rowIndex, row, categoryId });
  });

  return { errors, warnings, valid };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
    }
    if (user.role !== 'WHOLESALER' || !user.wholesalerId) {
      return apiError({
        status: 403,
        code: 'WHOLESALER_ONLY',
        message: 'Only wholesaler accounts can import a catalog.',
      });
    }
    const wholesalerId = user.wholesalerId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
    }

    const validation = importSchema.safeParse(body);
    if (!validation.success) {
      return apiError({
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'Import payload is invalid.',
        details: { fieldErrors: validation.error.flatten().fieldErrors },
      });
    }
    const { dryRun, rows } = validation.data;

    if (dryRun) {
      const { errors, warnings, valid } = await validateRows(prisma, rows);

      logger.info({
        event: 'csv_import',
        dryRun: true,
        wholesalerId,
        totalRows: rows.length,
        valid: valid.length,
        errorCount: errors.length,
        warningCount: warnings.length,
      });

      return NextResponse.json({
        valid: valid.length,
        errors,
        warnings,
      });
    }

    // Commit mode — validate + create inside ONE transaction so the SKU
    // collision check and the writes see a consistent catalog, and either
    // every valid row lands or none do.
    const result = await prisma.$transaction(
      async (tx) => {
        const { errors, warnings, valid } = await validateRows(tx, rows);

        if (valid.length === 0) {
          return { created: 0, skipped: errors, warningCount: warnings.length };
        }

        // Human product ids follow the register-route pattern for retailers:
        // prefix + zero-padded (count + offset). Offset 100 keeps clear of
        // seeded PRD001... ids.
        const baseCount = await tx.product.count();
        const productData = valid.map((v, j) => ({
          productId: `PRD${String(baseCount + 100 + j).padStart(3, '0')}`,
          sku: v.row.sku,
          upcCode: v.row.upc ?? null,
          name: v.row.name,
          description: v.row.description ?? null,
          brand: v.row.brand ?? null,
          categoryId: v.categoryId,
          imageUrl: v.row.imageUrl ?? null,
          ageRestricted: v.row.ageRestricted ?? true,
        }));

        await tx.product.createMany({ data: productData });

        const created = await tx.product.findMany({
          where: { sku: { in: productData.map((p) => p.sku) } },
          select: { id: true, sku: true },
        });
        const productIdBySku = new Map(created.map((p) => [p.sku, p.id]));

        await tx.productPricing.createMany({
          data: valid.map((v) => {
            const productId = productIdBySku.get(v.row.sku);
            if (!productId) {
              // Should be impossible — the create above just inserted it.
              // Throwing aborts the transaction rather than writing a
              // pricing row against the wrong product.
              throw new Error(`Product row missing after create for SKU ${v.row.sku}`);
            }
            const stock = v.row.stock ?? 0;
            return {
              productId,
              wholesalerId,
              wholesalePrice: new Prisma.Decimal(v.row.price),
              minimumOrderQty: v.row.moq ?? 1,
              caseQty: v.row.caseQty ?? null,
              stockQuantity: stock,
              stockStatus: stock > 0 ? ('IN_STOCK' as const) : ('OUT_OF_STOCK' as const),
            };
          }),
        });

        return { created: valid.length, skipped: errors, warningCount: warnings.length };
      },
      // Up to 5,000 rows in batched createMany calls — give the interactive
      // transaction more headroom than the 5s default.
      { timeout: 60_000, maxWait: 10_000 },
    );

    logger.info({
      event: 'csv_import',
      dryRun: false,
      wholesalerId,
      totalRows: rows.length,
      created: result.created,
      skippedCount: result.skipped.length,
      warningCount: result.warningCount,
    });

    return NextResponse.json({
      created: result.created,
      skipped: result.skipped,
    });
  } catch (error) {
    logger.error({ event: 'csv_import_error', error: (error as Error).message });
    return apiError({
      status: 500,
      code: 'IMPORT_FAILED',
      message: 'Import failed. Nothing was committed — please retry.',
    });
  }
}
