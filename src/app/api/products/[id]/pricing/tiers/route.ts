import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { priceTiersSchema } from '@/lib/validators';

interface RouteParams {
  params: { id: string };
}

/**
 * PUT /api/products/[id]/pricing/tiers — replace the caller-wholesaler's
 * volume-tier ladder on this product. Full replace (not merge): the editor
 * UI always sends the entire ladder, so the previous rows are history.
 *
 * Ladder invariants (ascending minQty, descending price) are enforced in
 * priceTiersSchema; checkout's selectUnitPrice() picks the matching tier.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (!user.wholesalerId) {
    return apiError({
      status: 403,
      code: 'WHOLESALER_ONLY',
      message: 'Only wholesaler accounts edit tier pricing.',
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
  }

  const validation = priceTiersSchema.safeParse(body);
  if (!validation.success) {
    return apiError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Tier ladder is invalid.',
      details: { fieldErrors: validation.error.flatten().fieldErrors },
    });
  }
  const { tiers } = validation.data;
  const wholesalerId = user.wholesalerId;

  // Ownership check at the SQL level: the pricing row must belong to the
  // caller's wholesaler. 404 (not 403) so competitors can't probe.
  const pricing = await prisma.productPricing.findFirst({
    where: { productId: params.id, wholesalerId },
    select: { id: true },
  });
  if (!pricing) {
    return apiError({
      status: 404,
      code: 'PRICING_NOT_FOUND',
      message: 'No listing for this product on your account.',
    });
  }

  const saved = await prisma.$transaction(async (tx) => {
    await tx.priceTier.deleteMany({ where: { productPricingId: pricing.id } });
    if (tiers.length > 0) {
      await tx.priceTier.createMany({
        data: tiers.map((t) => ({
          productPricingId: pricing.id,
          minQty: t.minQty,
          unitPrice: new Prisma.Decimal(t.unitPrice),
        })),
      });
    }
    return tx.priceTier.findMany({
      where: { productPricingId: pricing.id },
      orderBy: { minQty: 'asc' },
      select: { id: true, minQty: true, unitPrice: true },
    });
  });

  logger.info({
    event: 'price_tiers_replaced',
    wholesalerId,
    productId: params.id,
    tierCount: tiers.length,
  });

  return NextResponse.json({
    tiers: saved.map((t) => ({
      id: t.id,
      minQty: t.minQty,
      unitPrice: t.unitPrice.toFixed(2),
    })),
  });
}
