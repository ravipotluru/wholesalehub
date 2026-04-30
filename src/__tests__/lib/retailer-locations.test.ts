import {
  sortLocations,
  selectShipToLocation,
  snapshotShipTo,
  type LocationLike,
} from '@/lib/retailer-locations';

// ─── Fixtures ───

function makeLocation(overrides: Partial<LocationLike> = {}): LocationLike {
  return {
    id: 'loc-1',
    retailerId: 'rt-1',
    label: 'Main Store',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    isDefault: false,
    isActive: true,
    ...overrides,
  };
}

// ─── sortLocations ───

describe('sortLocations', () => {
  it('puts the default location first', () => {
    const sorted = sortLocations([
      makeLocation({ id: 'a', label: 'A', isDefault: false }),
      makeLocation({ id: 'b', label: 'B', isDefault: true }),
      makeLocation({ id: 'c', label: 'C', isDefault: false }),
    ]);
    expect(sorted.map((l) => l.id)).toEqual(['b', 'a', 'c']);
  });

  it('alphabetises by label among non-default rows', () => {
    const sorted = sortLocations([
      makeLocation({ id: 'a', label: 'Zeta' }),
      makeLocation({ id: 'b', label: 'Alpha' }),
      makeLocation({ id: 'c', label: 'Mike' }),
    ]);
    expect(sorted.map((l) => l.label)).toEqual(['Alpha', 'Mike', 'Zeta']);
  });

  it('leaves the input unchanged (returns a new array)', () => {
    const input = [
      makeLocation({ id: 'a', label: 'A' }),
      makeLocation({ id: 'b', label: 'B', isDefault: true }),
    ];
    const before = input.map((l) => l.id);
    sortLocations(input);
    expect(input.map((l) => l.id)).toEqual(before);
  });

  it('returns an empty array unchanged', () => {
    expect(sortLocations([])).toEqual([]);
  });
});

// ─── selectShipToLocation ───

describe('selectShipToLocation — explicit shipToLocationId', () => {
  it('uses the requested location when it exists + is active', () => {
    const locations = [
      makeLocation({ id: 'l1', label: 'A' }),
      makeLocation({ id: 'l2', label: 'B' }),
    ];
    const out = selectShipToLocation('l2', locations);
    expect(out.kind).toBe('use_location');
    if (out.kind === 'use_location') {
      expect(out.location.id).toBe('l2');
    }
  });

  it('rejects when the requested ID does not match any active location (cross-retailer probe)', () => {
    const locations = [makeLocation({ id: 'mine', retailerId: 'rt-me' })];
    const out = selectShipToLocation('not-mine', locations);
    expect(out).toEqual({ kind: 'reject', reason: 'NOT_OWNED_OR_INACTIVE' });
  });

  it('rejects when the requested location is inactive', () => {
    // Production code passes only ACTIVE locations to this function,
    // but defensively the helper still honours `isActive` if a stale row
    // sneaks in. The route layer also filters at the SQL boundary.
    const locations = [
      makeLocation({ id: 'l1', isActive: false }),
    ];
    const out = selectShipToLocation('l1', locations);
    expect(out).toEqual({ kind: 'reject', reason: 'NOT_OWNED_OR_INACTIVE' });
  });
});

describe('selectShipToLocation — implicit (no shipToLocationId provided)', () => {
  it('falls back when the retailer has zero locations (backward compat)', () => {
    const out = selectShipToLocation(undefined, []);
    expect(out).toEqual({ kind: 'fallback' });
  });

  it('picks the default location when one is flagged', () => {
    const locations = [
      makeLocation({ id: 'a', label: 'Aaa', isDefault: false }),
      makeLocation({ id: 'b', label: 'Bbb', isDefault: true }),
    ];
    const out = selectShipToLocation(undefined, locations);
    expect(out.kind).toBe('use_location');
    if (out.kind === 'use_location') {
      expect(out.location.id).toBe('b');
    }
  });

  it('picks the alphabetically-first location when no default is flagged', () => {
    const locations = [
      makeLocation({ id: 'z', label: 'Zeta' }),
      makeLocation({ id: 'a', label: 'Alpha' }),
      makeLocation({ id: 'm', label: 'Mike' }),
    ];
    const out = selectShipToLocation(undefined, locations);
    expect(out.kind).toBe('use_location');
    if (out.kind === 'use_location') {
      expect(out.location.id).toBe('a');
    }
  });

  it('uses default first even when the default is alphabetically last', () => {
    const locations = [
      makeLocation({ id: 'a', label: 'Alpha', isDefault: false }),
      makeLocation({ id: 'z', label: 'Zeta', isDefault: true }),
    ];
    const out = selectShipToLocation(undefined, locations);
    expect(out.kind).toBe('use_location');
    if (out.kind === 'use_location') {
      expect(out.location.id).toBe('z');
    }
  });
});

// ─── snapshotShipTo ───

describe('snapshotShipTo', () => {
  it('copies the location address fields onto the order snapshot', () => {
    const loc = makeLocation({
      id: 'loc-7',
      address: '500 Industrial Way',
      city: 'Houston',
      state: 'TX',
      zipCode: '77001',
    });
    expect(snapshotShipTo(loc)).toEqual({
      shipToLocationId: 'loc-7',
      shipToAddress: '500 Industrial Way',
      shipToCity: 'Houston',
      shipToState: 'TX',
      shipToZip: '77001',
    });
  });

  it('does not include any contact / label fields (those stay on the location)', () => {
    const loc = makeLocation({
      contactName: 'Janet',
      contactPhone: '555-0100',
    });
    const snap = snapshotShipTo(loc);
    expect(snap).not.toHaveProperty('contactName');
    expect(snap).not.toHaveProperty('contactPhone');
    expect(snap).not.toHaveProperty('label');
  });
});
