import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { locationPatchSchema } from '@/lib/validators';

interface RouteParams {
  params: { id: string };
}

/** PATCH /api/retailer/locations/[id] — edit a ship-to (scoped to caller). */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (!user.retailerId) {
    return apiError({ status: 403, code: 'RETAILER_ONLY', message: 'Retailer account required.' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
  }

  const validation = locationPatchSchema.safeParse(body);
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

  // Scoped read — 404 (not 403) so outsiders can't confirm the id exists.
  const existing = await prisma.retailerLocation.findFirst({
    where: { id: params.id, retailerId, isActive: true },
    select: { id: true },
  });
  if (!existing) {
    return apiError({ status: 404, code: 'LOCATION_NOT_FOUND', message: 'Location not found.' });
  }

  const location = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.retailerLocation.updateMany({
        where: { retailerId, isDefault: true, NOT: { id: params.id } },
        data: { isDefault: false },
      });
    }
    return tx.retailerLocation.update({
      where: { id: params.id },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.zipCode !== undefined && { zipCode: data.zipCode }),
        ...(data.contactName !== undefined && { contactName: data.contactName || null }),
        ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone || null }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    });
  });

  logger.info({ event: 'retailer_location_updated', retailerId, locationId: params.id });
  return NextResponse.json({ location });
}

/**
 * DELETE /api/retailer/locations/[id] — soft-delete (isActive=false) so past
 * orders keep a resolvable ship-to. If the default is deleted, promote the
 * oldest remaining location.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (!user.retailerId) {
    return apiError({ status: 403, code: 'RETAILER_ONLY', message: 'Retailer account required.' });
  }
  const retailerId = user.retailerId;

  const result = await prisma.$transaction(async (tx) => {
    // updateMany scoped by retailerId = the SQL-level ownership check.
    const updated = await tx.retailerLocation.updateMany({
      where: { id: params.id, retailerId, isActive: true },
      data: { isActive: false, isDefault: false },
    });
    if (updated.count === 0) return { found: false as const };

    const stillDefault = await tx.retailerLocation.count({
      where: { retailerId, isActive: true, isDefault: true },
    });
    if (stillDefault === 0) {
      const oldest = await tx.retailerLocation.findFirst({
        where: { retailerId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (oldest) {
        await tx.retailerLocation.update({
          where: { id: oldest.id },
          data: { isDefault: true },
        });
      }
    }
    return { found: true as const };
  });

  if (!result.found) {
    return apiError({ status: 404, code: 'LOCATION_NOT_FOUND', message: 'Location not found.' });
  }

  logger.info({ event: 'retailer_location_deleted', retailerId, locationId: params.id });
  return NextResponse.json({ ok: true });
}
