import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  readIdempotencyKey,
  hashRequestBody,
  checkIdempotency,
  storeIdempotentResponse,
} from '@/lib/idempotency';
import { csvImportSchema } from '@/lib/validators';
import {
  validateAndPlanImport,
  buildProductCreateInput,
  buildPricingCreateNestedInput,
  buildPricingUpsertInput,
  type CategoryLookup,
  type ExistingProduct,
  type ExistingPricing,
  type ImportRowError,
} from '@/lib/catalog-import';
import { generateProductId } from '@/lib/utils';

/**
 * POST /api/wholesaler/products/import — bulk catalog upload.
 *
 * **Why JSON over multipart/form-data.**
 * The task allowed either. We chose `application/json` with a `{ rows: [...] }`
 * body because:
 *   1. Zod validation is one-shot — no double parse (CSV string → object →
 *      schema). Errors map cleanly to the 0-based `rowIndex` the client sent.
 *   2. The existing test patterns in this repo (`reorder.test.ts`,
 *      `idempotency.test.ts`) all stub a JSON body; a CSV path would need
 *      a `formidable`/`multer`-shaped fixture which we don't currently have.
 *   3. The JSON shape is what every front-end CSV uploader produces *after*
 *      Papa Parse anyway — pushing parsing into the browser keeps the server
 *      simpler and the wire format self-describing.
 *
 * A future revision can add a multipart adapter that pre-parses the CSV
 * into the same `{ rows }` shape and re-uses every line of this handler.
 *
 * **Behaviour contract.**
 *   - 401 unauthenticated; 403 if role !== WHOLESALER or `wholesalerId` is null.
 *   - 400 with the structured error envelope on Zod failure or per-row errors.
 *   - 409 on `Idempotency-Key` reuse with a different body hash.
 *   - 200 with `{ imported, updated, skipped, totalProcessed }` on success.
 *   - All multi-write logic is wrapped in `prisma.$transaction` so partial
 *     uploads never persist.
 */
export async function POST(request: NextRequest) {
  try {
    // ─── Auth ─────────────────────────────────────────────────────────
    const user = await getAuthedUser();
    if (!user) {
      return apiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'You must be signed in to import a catalog.',
      });
    }
    if (user.role !== 'WHOLESALER' || !user.wholesalerId) {
      return apiError({
        status: 403,
        code: 'WHOLESALER_REQUIRED',
        message: 'Only an authenticated wholesaler can import a catalog.',
        logContext: { userId: user.id, role: user.role },
      });
    }
    const wholesalerId = user.wholesalerId;

    // ─── Body parse + Zod validation ──────────────────────────────────
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError({
        status: 400,
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON.',
      });
    }

    const parsed = csvImportSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: 'CATALOG_IMPORT_PAYLOAD_INVALID',
        message: 'Request body did not match the import schema.',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }
    const { rows } = parsed.data;

    // ─── Idempotency replay ───────────────────────────────────────────
    // Identical retries (same key + same body hash) replay the cached
    // response. Different body with the same key is a 409 — almost
    // always a client bug worth surfacing rather than silently routing.
    const idempotencyKey = readIdempotencyKey(request);
    const idempotencyScope = `POST /api/wholesaler/products/import:${wholesalerId}`;
    const idempotencyHash = idempotencyKey ? hashRequestBody(parsed.data) : null;

    if (idempotencyKey && idempotencyHash) {
      const outcome = await checkIdempotency(
        prisma,
        idempotencyScope,
        idempotencyKey,
        idempotencyHash,
      );
      if (outcome.kind === 'replay') {
        logger.info({
          event: 'catalog_import_idempotent_replay',
          wholesalerId,
          idempotencyKey,
        });
        return NextResponse.json(outcome.cached.body, {
          status: outcome.cached.statusCode,
          headers: { 'Idempotent-Replay': 'true' },
        });
      }
      if (outcome.kind === 'conflict') {
        return apiError({
          status: 409,
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          message:
            'Idempotency-Key was reused with a different request body. ' +
            'Generate a new key for a new import.',
        });
      }
    }

    // ─── Pre-load existing rows for the planner ───────────────────────
    // Three queries up-front, then everything else is in-memory:
    //   1. Products by sku — find the "existing Product, just attach pricing"
    //      branch.
    //   2. ProductPricing rows for *this* wholesaler covering those products
    //      — decides whether a row is upsert→create or upsert→update.
    //   3. Categories the rows reference — by `categoryId` and `name`. We
    //      load all categories whose `categoryId` or `name` appears in the
    //      upload to keep memory bounded; in practice catalogs have a
    //      handful of categories so this is cheap.
    //
    // Rows are typed `unknown[]` at this stage (per-row Zod runs inside
    // the planner so errors carry their row index). We pull the sku and
    // category hints best-effort — invalid rows simply get empty hints,
    // and the planner will reject them in the next step anyway.
    function readField(row: unknown, key: string): string | undefined {
      if (typeof row === 'object' && row !== null && key in row) {
        const value = (row as Record<string, unknown>)[key];
        return typeof value === 'string' ? value : undefined;
      }
      return undefined;
    }

    const skuList = Array.from(
      new Set(
        rows
          .map((r) => readField(r, 'sku'))
          .filter((s): s is string => !!s),
      ),
    );
    const categoryHints = Array.from(
      new Set(
        rows
          .map((r) => readField(r, 'category'))
          .filter((s): s is string => !!s),
      ),
    );

    const [existingProducts, categoryRows] = await Promise.all([
      prisma.product.findMany({
        where: { sku: { in: skuList } },
        select: { id: true, sku: true },
      }),
      categoryHints.length > 0
        ? prisma.category.findMany({
            where: {
              OR: [
                { categoryId: { in: categoryHints } },
                {
                  name: {
                    in: categoryHints,
                    mode: 'insensitive',
                  },
                },
              ],
            },
            select: { id: true, categoryId: true, name: true },
          })
        : Promise.resolve([] as CategoryLookup[]),
    ]);

    const existingProductIds = existingProducts.map((p) => p.id);
    const existingPricings: ExistingPricing[] =
      existingProductIds.length > 0
        ? (
            await prisma.productPricing.findMany({
              where: {
                productId: { in: existingProductIds },
                wholesalerId,
              },
              select: { productId: true, wholesalerId: true },
            })
          )
        : [];

    const existingProductsBySku = new Map<string, ExistingProduct>(
      existingProducts.map((p) => [p.sku, p]),
    );
    const existingPricingsByProductId = new Map<string, ExistingPricing>(
      existingPricings.map((p) => [p.productId, p]),
    );
    const categoriesByCategoryId = new Map<string, CategoryLookup>();
    const categoriesByLowerName = new Map<string, CategoryLookup>();
    for (const c of categoryRows) {
      categoriesByCategoryId.set(c.categoryId, c);
      categoriesByLowerName.set(c.name.toLocaleLowerCase(), c);
    }

    // ─── Plan ─────────────────────────────────────────────────────────
    const plan = validateAndPlanImport(rows, {
      wholesalerId,
      existingProductsBySku,
      existingPricingsByProductId,
      categoriesByCategoryId,
      categoriesByLowerName,
    });

    if (plan.errors.length > 0) {
      // Spec: "Reject the entire upload (no partial commits) if any row
      // fails — return 400 with a per-row error report." We log a summary
      // (count + first few) and return the full list to the caller so the
      // client can render the spreadsheet annotations.
      logger.warn({
        event: 'catalog_import_rejected',
        wholesalerId,
        rowCount: rows.length,
        errorCount: plan.errors.length,
      });
      return apiError({
        status: 400,
        code: 'CATALOG_IMPORT_ROW_ERRORS',
        message: 'One or more rows failed validation; nothing was imported.',
        details: { errors: plan.errors satisfies ImportRowError[] },
      });
    }

    // ─── Apply ────────────────────────────────────────────────────────
    // Single transaction: every Product.create + ProductPricing.upsert
    // lands together or not at all.
    const result = await prisma.$transaction(async (tx) => {
      // `skipped` is reserved for non-fatal post-validation skips — today
      // none exist (validation errors hard-reject the whole upload), but
      // the response shape is part of the public contract so we always
      // emit the field. A future addition (e.g. "skip rows whose SKU
      // collides with another wholesaler's exclusive listing") will
      // populate this without changing the response shape.
      const skipped: Array<{ row: number; sku: string; reason: string }> = [];

      // Creates first — these include nested pricing creation.
      for (const planned of plan.toCreate) {
        const productData = buildProductCreateInput(planned, {
          productId: generateProductId(),
        });
        const pricingData = buildPricingCreateNestedInput(
          planned.row,
          wholesalerId,
        );
        await tx.product.create({
          data: {
            ...productData,
            pricings: { create: [pricingData] },
          },
        });
      }

      // Upserts: existing Product, attach (or update) this wholesaler's
      // pricing. If a previous upload already created this pricing row for
      // this wholesaler we treat it as an "updated" outcome — same SKU,
      // refreshed price.
      for (const planned of plan.toUpsert) {
        const upsertArgs = buildPricingUpsertInput(
          planned.row,
          planned.existingProductId,
          wholesalerId,
        );
        await tx.productPricing.upsert(upsertArgs);
      }

      const responseBody = {
        imported: plan.toCreate.length,
        updated: plan.toUpsert.length,
        skipped,
        totalProcessed: rows.length,
      };

      if (idempotencyKey && idempotencyHash) {
        await storeIdempotentResponse(
          tx,
          idempotencyScope,
          idempotencyKey,
          idempotencyHash,
          { statusCode: 200, body: responseBody },
        );
      }

      return responseBody;
    });

    logger.info({
      event: 'catalog_import',
      wholesalerId,
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped.length,
      idempotent: !!idempotencyKey,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error({
      event: 'catalog_import_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'CATALOG_IMPORT_FAILED',
      message: 'Failed to import catalog.',
    });
  }
}
