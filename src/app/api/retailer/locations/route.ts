import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { locationSchema } from '@/lib/validators';

/** GET /api/retailer/locations — caller's active ship-to locations. */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (!user.retailerId) {
    return apiError({
      status: 403,
      code: 'RETAILER_ONLY',
      message: 'Only retailer accounts have ship-to locations.',
    });
  }

  const locations = await prisma.retailerLocation.findMany({
    where: { retailerId: user.retailerId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json({ locations });
}

/** POST /api/retailer/locations — add a ship-to. First one becomes default. */
export async function POST(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (!user.retailerId) {
    return apiError({
      status: 403,
      code: 'RETAILER_ONLY',
      message: 'Only retailer accounts have ship-to locations.',
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
  }

  const validation = locationSchema.safeParse(body);
  if (!validation.success) {
    return apiError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Location is invalid.',
      details: { fieldErrors: validation.error.flatten().fieldErrors },
    });
  }
  const data = validation.data;
  const retailerId = user.retailerId;

  const location = await prisma.$transaction(async (tx) => {
    const existingCount = await tx.retailerLocation.count({
      where: { retailerId, isActive: true },
    });
    const makeDefault = data.isDefault || existingCount === 0;

    if (makeDefault) {
      await tx.retailerLocation.updateMany({
        where: { retailerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.retailerLocation.create({
      data: {
        retailerId,
        label: data.label,
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        contactName: data.contactName || null,
        contactPhone: data.contactPhone || null,
        isDefault: makeDefault,
      },
    });
  });

  logger.info({ event: 'retailer_location_created', retailerId, locationId: location.id });
  return NextResponse.json({ location }, { status: 201 });
}
