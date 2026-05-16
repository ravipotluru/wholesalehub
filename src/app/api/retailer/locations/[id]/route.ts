import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { updateRetailerLocationSchema } from '@/lib/validators';

/**
 * Order statuses that count as "open" for the soft-delete guard. An open
 * order whose `shipToLocationId` points at the location being deleted
 * blocks the delete with a 409 — otherwise we'd be cancelling the only
 * pointer to where that order is supposed to go. DELIVERED and CANCELLED
 * orders are terminal and safe to leave behind (the snapshot `shipTo*`
 * columns preserve history).
 */
const OPEN_ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'PARTIALLY_SHIPPED',
] as const;

/**
 * PATCH /api/retailer/locations/[id] — update a ship-to location.
 *
 * Owner-scoped: the lookup uses `where: { id, retailerId }` so a buyer
 * can never edit another retailer's row, even by guessing IDs. If the
 * body promotes this row to `isDefault: true`, we atomically clear the
 * flag on every other row for the same retailer in the same transaction.
 *
 * RETAILER only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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
    const validation = updateRetailerLocationSchema.safeParse(body);

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

    const result = await prisma.$transaction(async (tx) => {
      // Owner-scoped pre-check. We use findFirst so the where filter can
      // include retailerId — findUnique would only accept the @id key.
      const existing = await tx.retailerLocation.findFirst({
        where: { id: params.id, retailerId, isActive: true },
      });

      if (!existing) {
        // Match the rest of the codebase: 404 (not 403) when a resource
        // isn't ours, so an attacker can't confirm IDs by probing.
        return { ok: false as const, status: 404 };
      }

      // Promoting to default → clear other defaults atomically. Demoting
      // to non-default just lands as a normal column update.
      if (data.isDefault === true && !existing.isDefault) {
        await tx.retailerLocation.updateMany({
          where: { retailerId, isDefault: true, NOT: { id: params.id } },
          data: { isDefault: false },
        });
      }

      const updated = await tx.retailerLocation.update({
        where: { id: params.id },
        data: {
          ...(data.label !== undefined && { label: data.label }),
          ...(data.address !== undefined && { address: data.address }),
          ...(data.city !== undefined && { city: data.city }),
          ...(data.state !== undefined && { state: data.state }),
          ...(data.zipCode !== undefined && { zipCode: data.zipCode }),
          ...(data.contactName !== undefined && {
            contactName: data.contactName,
          }),
          ...(data.contactPhone !== undefined && {
            contactPhone: data.contactPhone,
          }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        },
      });

      return { ok: true as const, location: updated };
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    logger.info({
      event: 'retailer_location_updated',
      retailerId,
      locationId: params.id,
    });

    return NextResponse.json({ location: result.location });
  } catch (error) {
    logger.error({
      event: 'retailer_location_update_error',
      locationId: params.id,
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to update location' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/retailer/locations/[id] — soft-delete a ship-to location.
 *
 * Soft-delete via `isActive=false`, never a hard `delete`, because Order
 * rows reference the location and we want history preserved. A hard
 * cascade would either nuke the FK on every order or leave dangling rows.
 *
 * 409 conflict if this is the retailer's last active location AND there
 * is at least one open (non-DELIVERED, non-CANCELLED) order pointing at
 * it. The buyer must keep at least one usable destination for those
 * orders to ship to — otherwise they'd lose their only valid checkout
 * target mid-flight.
 *
 * RETAILER only.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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

    type DeleteOutcome =
      | { kind: 'not_found' }
      | {
          kind: 'open_orders';
          openOrderCount: number;
        }
      | { kind: 'deleted'; location: Awaited<ReturnType<typeof prisma.retailerLocation.update>> };

    const result: DeleteOutcome = await prisma.$transaction(async (tx) => {
      const existing = await tx.retailerLocation.findFirst({
        where: { id: params.id, retailerId, isActive: true },
      });

      if (!existing) {
        return { kind: 'not_found' };
      }

      // Count remaining active locations after this delete. If zero AND
      // this location has open orders, refuse the delete.
      const remainingActive = await tx.retailerLocation.count({
        where: {
          retailerId,
          isActive: true,
          NOT: { id: params.id },
        },
      });

      if (remainingActive === 0) {
        const openOrderCount = await tx.order.count({
          where: {
            shipToLocationId: params.id,
            orderStatus: { in: [...OPEN_ORDER_STATUSES] },
          },
        });

        if (openOrderCount > 0) {
          return { kind: 'open_orders', openOrderCount };
        }
      }

      // Soft-delete + drop the default flag (so a later create that sets
      // isDefault: true doesn't have to deal with a deactivated default).
      const updated = await tx.retailerLocation.update({
        where: { id: params.id },
        data: { isActive: false, isDefault: false },
      });

      return { kind: 'deleted', location: updated };
    });

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }
    if (result.kind === 'open_orders') {
      return NextResponse.json(
        {
          error:
            'Cannot delete the last active location while open orders ' +
            'still ship to it. Add another location first or wait for ' +
            'these orders to deliver.',
          openOrderCount: result.openOrderCount,
        },
        { status: 409 },
      );
    }

    logger.info({
      event: 'retailer_location_deleted',
      retailerId,
      locationId: params.id,
    });

    // result.kind === 'deleted' is the only remaining narrow.
    return NextResponse.json({ location: result.location });
  } catch (error) {
    logger.error({
      event: 'retailer_location_delete_error',
      locationId: params.id,
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to delete location' },
      { status: 500 },
    );
  }
}
