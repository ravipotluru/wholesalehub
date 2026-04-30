import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { createRetailerLocationSchema } from '@/lib/validators';
import { sortLocations } from '@/lib/retailer-locations';

/**
 * GET /api/retailer/locations — list ship-to locations for the calling
 * retailer. Returns active rows only, sorted with `isDefault: true` first,
 * then alphabetical by label so the most-likely choice surfaces first in
 * the checkout selector.
 *
 * RETAILER role only. The query is owner-scoped via `where.retailerId`,
 * so a retailer can never see another retailer's locations.
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'RETAILER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const retailerId = user.retailerId;
    if (!retailerId) {
      return NextResponse.json(
        { error: 'No retailer linked to this account' },
        { status: 403 },
      );
    }

    const rows = await prisma.retailerLocation.findMany({
      where: { retailerId, isActive: true },
    });

    return NextResponse.json({ locations: sortLocations(rows) });
  } catch (error) {
    logger.error({
      event: 'retailer_locations_list_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to fetch locations' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/retailer/locations — create a ship-to location for the calling
 * retailer.
 *
 * If the body sets `isDefault: true`, we atomically clear `isDefault` on
 * every other row for the same retailer inside the same `$transaction`.
 * That's the only way to guarantee at most one default at a time without
 * relying on a partial-unique index (which Postgres supports but Prisma's
 * declarative API does not express cleanly today).
 *
 * RETAILER only.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'RETAILER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const retailerId = user.retailerId;
    if (!retailerId) {
      return NextResponse.json(
        { error: 'No retailer linked to this account' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validation = createRetailerLocationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data = validation.data;

    const created = await prisma.$transaction(async (tx) => {
      // If this row is marked default, clear default on every other row
      // first. Doing both updates inside one transaction guarantees we
      // never momentarily have two defaults (concurrent POSTs would each
      // serialize at the row level).
      if (data.isDefault === true) {
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
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          notes: data.notes,
          isDefault: data.isDefault === true,
        },
      });
    });

    logger.info({
      event: 'retailer_location_created',
      retailerId,
      locationId: created.id,
      isDefault: created.isDefault,
    });

    return NextResponse.json({ location: created }, { status: 201 });
  } catch (error) {
    logger.error({
      event: 'retailer_location_create_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to create location' },
      { status: 500 },
    );
  }
}
