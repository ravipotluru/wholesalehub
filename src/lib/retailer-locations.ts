/**
 * Pure helpers for the multi-location ship-to feature. Kept outside the
 * route handlers so the rules below are unit-testable without a Next.js
 * request mock or a live database.
 *
 * The data model:
 *   - Retailer = bill-to legal entity (one row).
 *   - RetailerLocation = ship-to physical store (many rows per Retailer).
 *
 * At checkout the buyer either picks a location explicitly via
 * `shipToLocationId`, or the API falls back to the retailer's default
 * (or first active) location. Retailers with zero locations keep working
 * via the legacy `shippingAddress` body fields — that backward-compat path
 * is what `selectShipToLocation` returns `null` for.
 */

export type LocationLike = {
  id: string;
  retailerId: string;
  label: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
  isActive: boolean;
};

export type ShipToSnapshot = {
  shipToLocationId: string;
  shipToAddress: string;
  shipToCity: string;
  shipToState: string;
  shipToZip: string;
};

/**
 * Sort comparator used by `GET /api/retailer/locations` and the default
 * picker below: `isDefault: true` first, then alphabetical by label.
 */
export function sortLocations<T extends { isDefault: boolean; label: string }>(
  locations: T[],
): T[] {
  return [...locations].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Resolve which location an order should ship to, given:
 *   - `requestedId`: the optional `shipToLocationId` from the checkout body.
 *   - `locations`: the full set of ACTIVE locations for the retailer.
 *
 * Outcomes:
 *   - `'use_location'`: snapshot this location's address into the order.
 *   - `'reject'`: the requested ID does not belong to the retailer or is
 *     inactive — checkout returns 400.
 *   - `'fallback'`: retailer has zero active locations; checkout uses the
 *     legacy `shippingAddress` body fields (backward compat).
 */
export type SelectShipToOutcome =
  | { kind: 'use_location'; location: LocationLike }
  | { kind: 'reject'; reason: 'NOT_OWNED_OR_INACTIVE' }
  | { kind: 'fallback' };

export function selectShipToLocation(
  requestedId: string | undefined,
  locations: LocationLike[],
): SelectShipToOutcome {
  if (requestedId) {
    const match = locations.find((l) => l.id === requestedId && l.isActive);
    if (!match) {
      // Either the buyer is poking at another retailer's IDs, or the
      // location was just deactivated. Either way we refuse to silently
      // pick a different one — the buyer asked for a specific store.
      return { kind: 'reject', reason: 'NOT_OWNED_OR_INACTIVE' };
    }
    return { kind: 'use_location', location: match };
  }

  if (locations.length === 0) {
    return { kind: 'fallback' };
  }

  // Default-first, then alphabetical. If no row is flagged default, the
  // first alphabetical active location wins.
  const sorted = sortLocations(locations);
  return { kind: 'use_location', location: sorted[0] };
}

/**
 * Snapshot the location's address into the columns we persist on `Order`.
 * The snapshot is what guarantees historical accuracy: even if the
 * RetailerLocation row is later edited (or soft-deleted), the order keeps
 * the address it was actually shipped to.
 */
export function snapshotShipTo(location: LocationLike): ShipToSnapshot {
  return {
    shipToLocationId: location.id,
    shipToAddress: location.address,
    shipToCity: location.city,
    shipToState: location.state,
    shipToZip: location.zipCode,
  };
}
