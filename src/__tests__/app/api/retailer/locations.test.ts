/**
 * Route-handler tests for /api/retailer/locations and /api/retailer/locations/[id].
 *
 * Strategy: stub prisma + getAuthedUser, then drive the actual route
 * handlers. This lets us assert the auth + ownership + transaction shape
 * (especially the atomic isDefault flip and the soft-delete open-order
 * guard) without standing up a real DB.
 */

type LocationRow = {
  id: string;
  retailerId: string;
  label: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type OrderRow = {
  id: string;
  shipToLocationId: string | null;
  orderStatus:
    | 'PENDING'
    | 'CONFIRMED'
    | 'PROCESSING'
    | 'SHIPPED'
    | 'PARTIALLY_SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'REJECTED';
};

const state: {
  authedUser:
    | {
        id: string;
        role: string;
        retailerId: string | null;
        wholesalerId: string | null;
      }
    | null;
  locations: LocationRow[];
  orders: OrderRow[];
  idSeq: number;
} = {
  authedUser: null,
  locations: [],
  orders: [],
  idSeq: 0,
};

function nextId(prefix = 'loc'): string {
  state.idSeq += 1;
  return `${prefix}_${state.idSeq}`;
}

// In-memory prisma — only the surface the routes use.
function locationMatches(
  row: LocationRow,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'NOT') {
      const nv = v as Record<string, unknown>;
      if (locationMatches(row, nv)) return false;
      continue;
    }
    const rowVal = (row as unknown as Record<string, unknown>)[k];
    if (rowVal !== v) return false;
  }
  return true;
}

const fakePrisma = {
  retailerLocation: {
    async findFirst({ where }: { where: Record<string, unknown> }) {
      return state.locations.find((r) => locationMatches(r, where)) ?? null;
    },
    async findMany({ where }: { where?: Record<string, unknown> } = {}) {
      return state.locations.filter((r) => locationMatches(r, where));
    },
    async count({ where }: { where: Record<string, unknown> }) {
      return state.locations.filter((r) => locationMatches(r, where)).length;
    },
    async create({ data }: { data: Partial<LocationRow> }) {
      const row: LocationRow = {
        id: nextId(),
        retailerId: data.retailerId ?? '',
        label: data.label ?? '',
        address: data.address ?? '',
        city: data.city ?? '',
        state: data.state ?? '',
        zipCode: data.zipCode ?? '',
        contactName: data.contactName ?? null,
        contactPhone: data.contactPhone ?? null,
        notes: data.notes ?? null,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.locations.push(row);
      return row;
    },
    async update({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<LocationRow>;
    }) {
      const row = state.locations.find((r) => r.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      row.updatedAt = new Date();
      return row;
    },
    async updateMany({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Partial<LocationRow>;
    }) {
      let count = 0;
      for (const row of state.locations) {
        if (locationMatches(row, where)) {
          Object.assign(row, data);
          row.updatedAt = new Date();
          count += 1;
        }
      }
      return { count };
    },
  },
  order: {
    async count({ where }: { where: Record<string, unknown> }) {
      const status = where.orderStatus as { in?: string[] } | undefined;
      const inSet = new Set(status?.in ?? []);
      return state.orders.filter(
        (o) =>
          o.shipToLocationId === where.shipToLocationId &&
          (inSet.size === 0 || inSet.has(o.orderStatus)),
      ).length;
    },
  },
  async $transaction<T>(fn: (tx: typeof fakePrisma) => Promise<T>): Promise<T> {
    return fn(fakePrisma);
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: fakePrisma }));
jest.mock('@/lib/session', () => ({
  getAuthedUser: () => Promise.resolve(state.authedUser),
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/retailer/locations/route';
import {
  PATCH,
  DELETE,
} from '@/app/api/retailer/locations/[id]/route';

/**
 * Minimal NextRequest factory for tests. The route handlers only call
 * `.json()` and `.headers.get(...)` so a Next-shaped request constructed
 * from the URL + RequestInit is enough.
 */
function makeReq(body?: unknown, method: string = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/retailer/locations', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
  });
}

beforeEach(() => {
  state.authedUser = {
    id: 'user_1',
    role: 'RETAILER',
    retailerId: 'rt_owner',
    wholesalerId: null,
  };
  state.locations = [];
  state.orders = [];
  state.idSeq = 0;
});

// ─── auth + role ───

describe('GET /api/retailer/locations — auth and role', () => {
  it('rejects unauthenticated callers with 401', async () => {
    state.authedUser = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('rejects WHOLESALER role with 403', async () => {
    state.authedUser = {
      id: 'u',
      role: 'WHOLESALER',
      retailerId: null,
      wholesalerId: 'ws_1',
    };
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('rejects RETAILER without a retailerId with 403', async () => {
    state.authedUser = {
      id: 'u',
      role: 'RETAILER',
      retailerId: null,
      wholesalerId: null,
    };
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

// ─── GET — list ordering + scoping ───

describe('GET /api/retailer/locations — listing', () => {
  it('returns the retailer’s locations sorted default-first then alphabetical', async () => {
    state.locations = [
      {
        id: 'a',
        retailerId: 'rt_owner',
        label: 'Zeta Store',
        address: 'addr',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'b',
        retailerId: 'rt_owner',
        label: 'Bbb Store',
        address: 'addr',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'c',
        retailerId: 'rt_owner',
        label: 'Aaa Store',
        address: 'addr',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const res = await GET();
    const json = (await res.json()) as { locations: LocationRow[] };
    expect(json.locations.map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not return another retailer’s locations (owner scoping)', async () => {
    state.locations = [
      {
        id: 'mine',
        retailerId: 'rt_owner',
        label: 'Mine',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'theirs',
        retailerId: 'rt_other',
        label: 'Theirs',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const res = await GET();
    const json = (await res.json()) as { locations: LocationRow[] };
    expect(json.locations.map((l) => l.id)).toEqual(['mine']);
  });

  it('omits soft-deleted (isActive=false) rows', async () => {
    state.locations = [
      {
        id: 'live',
        retailerId: 'rt_owner',
        label: 'Live',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'dead',
        retailerId: 'rt_owner',
        label: 'Dead',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const res = await GET();
    const json = (await res.json()) as { locations: LocationRow[] };
    expect(json.locations.map((l) => l.id)).toEqual(['live']);
  });
});

// ─── POST — create ───

describe('POST /api/retailer/locations — create', () => {
  it('creates a new location for the calling retailer', async () => {
    const res = await POST(
      makeReq({
        label: 'Main Store',
        address: '123 Main',
        city: 'Austin',
        state: 'TX',
        zipCode: '78701',
      }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { location: LocationRow };
    expect(json.location.retailerId).toBe('rt_owner');
    expect(json.location.label).toBe('Main Store');
    expect(json.location.isDefault).toBe(false);
    expect(json.location.isActive).toBe(true);
  });

  it('rejects validation errors with 400', async () => {
    const res = await POST(
      makeReq({
        // Missing label.
        address: '123 Main',
        city: 'Austin',
        state: 'TX',
        zipCode: '78701',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('atomically clears other defaults when creating with isDefault=true', async () => {
    // Existing default for the same retailer.
    state.locations = [
      {
        id: 'existing_default',
        retailerId: 'rt_owner',
        label: 'Old Default',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Another retailer with a default — must NOT be affected.
      {
        id: 'foreign_default',
        retailerId: 'rt_other',
        label: 'Other Co Default',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const res = await POST(
      makeReq({
        label: 'New Default',
        address: '500 Industrial Way',
        city: 'Houston',
        state: 'TX',
        zipCode: '77001',
        isDefault: true,
      }),
    );
    expect(res.status).toBe(201);

    // Old same-retailer default is now non-default.
    expect(
      state.locations.find((l) => l.id === 'existing_default')?.isDefault,
    ).toBe(false);
    // Foreign default is untouched.
    expect(
      state.locations.find((l) => l.id === 'foreign_default')?.isDefault,
    ).toBe(true);

    // Exactly one default remains for rt_owner.
    const ownDefaults = state.locations.filter(
      (l) => l.retailerId === 'rt_owner' && l.isDefault,
    );
    expect(ownDefaults).toHaveLength(1);
    expect(ownDefaults[0].label).toBe('New Default');
  });
});

// ─── PATCH — update ───

describe('PATCH /api/retailer/locations/[id] — update', () => {
  it('updates only the provided fields', async () => {
    state.locations = [
      {
        id: 'l1',
        retailerId: 'rt_owner',
        label: 'Old',
        address: 'old addr',
        city: 'oldcity',
        state: 'TX',
        zipCode: '00000',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const res = await PATCH(makeReq({ label: 'New' }, 'PATCH'), {
      params: { id: 'l1' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { location: LocationRow };
    expect(json.location.label).toBe('New');
    expect(json.location.address).toBe('old addr');
  });

  it('returns 404 when the location belongs to another retailer (owner scoping)', async () => {
    state.locations = [
      {
        id: 'theirs',
        retailerId: 'rt_other',
        label: 'Not yours',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const res = await PATCH(makeReq({ label: 'Hijacked' }, 'PATCH'), {
      params: { id: 'theirs' },
    });
    expect(res.status).toBe(404);
    // The foreign row was not mutated.
    expect(
      state.locations.find((l) => l.id === 'theirs')?.label,
    ).toBe('Not yours');
  });

  it('flips isDefault atomically — exactly one default remains', async () => {
    state.locations = [
      {
        id: 'a',
        retailerId: 'rt_owner',
        label: 'A',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'b',
        retailerId: 'rt_owner',
        label: 'B',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const res = await PATCH(makeReq({ isDefault: true }, 'PATCH'), {
      params: { id: 'b' },
    });
    expect(res.status).toBe(200);

    expect(state.locations.find((l) => l.id === 'a')?.isDefault).toBe(false);
    expect(state.locations.find((l) => l.id === 'b')?.isDefault).toBe(true);
    const defaults = state.locations.filter(
      (l) => l.retailerId === 'rt_owner' && l.isDefault,
    );
    expect(defaults).toHaveLength(1);
  });
});

// ─── DELETE — soft delete + open-order guard ───

describe('DELETE /api/retailer/locations/[id] — soft delete', () => {
  it('soft-deletes (isActive=false) rather than hard-deleting', async () => {
    state.locations = [
      {
        id: 'l1',
        retailerId: 'rt_owner',
        label: 'A',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'l2',
        retailerId: 'rt_owner',
        label: 'B',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const res = await DELETE(makeReq(undefined, 'DELETE'), {
      params: { id: 'l1' },
    });
    expect(res.status).toBe(200);
    const row = state.locations.find((l) => l.id === 'l1');
    expect(row).toBeDefined();
    expect(row?.isActive).toBe(false);
    expect(row?.isDefault).toBe(false);
  });

  it('returns 409 when this is the last active location AND has open orders', async () => {
    state.locations = [
      {
        id: 'only',
        retailerId: 'rt_owner',
        label: 'Only Store',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    state.orders = [
      { id: 'ord_1', shipToLocationId: 'only', orderStatus: 'PROCESSING' },
    ];
    const res = await DELETE(makeReq(undefined, 'DELETE'), {
      params: { id: 'only' },
    });
    expect(res.status).toBe(409);
    // Row was NOT mutated.
    expect(state.locations[0].isActive).toBe(true);
  });

  it('allows deleting the last active location when only DELIVERED/CANCELLED orders point at it', async () => {
    state.locations = [
      {
        id: 'only',
        retailerId: 'rt_owner',
        label: 'Only Store',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    state.orders = [
      { id: 'd1', shipToLocationId: 'only', orderStatus: 'DELIVERED' },
      { id: 'c1', shipToLocationId: 'only', orderStatus: 'CANCELLED' },
    ];
    const res = await DELETE(makeReq(undefined, 'DELETE'), {
      params: { id: 'only' },
    });
    expect(res.status).toBe(200);
    expect(state.locations[0].isActive).toBe(false);
  });

  it('allows deleting a location with open orders if other active locations remain', async () => {
    state.locations = [
      {
        id: 'l1',
        retailerId: 'rt_owner',
        label: 'A',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'l2',
        retailerId: 'rt_owner',
        label: 'B',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    state.orders = [
      { id: 'o', shipToLocationId: 'l1', orderStatus: 'PROCESSING' },
    ];
    const res = await DELETE(makeReq(undefined, 'DELETE'), {
      params: { id: 'l1' },
    });
    expect(res.status).toBe(200);
    expect(state.locations.find((l) => l.id === 'l1')?.isActive).toBe(false);
    expect(state.locations.find((l) => l.id === 'l2')?.isActive).toBe(true);
  });

  it('returns 404 for a foreign retailer’s location', async () => {
    state.locations = [
      {
        id: 'theirs',
        retailerId: 'rt_other',
        label: 'Theirs',
        address: 'a',
        city: 'c',
        state: 's',
        zipCode: 'z',
        contactName: null,
        contactPhone: null,
        notes: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const res = await DELETE(makeReq(undefined, 'DELETE'), {
      params: { id: 'theirs' },
    });
    expect(res.status).toBe(404);
    expect(state.locations[0].isActive).toBe(true);
  });
});
