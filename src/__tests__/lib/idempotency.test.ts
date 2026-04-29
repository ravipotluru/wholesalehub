import {
  readIdempotencyKey,
  hashRequestBody,
  checkIdempotency,
  storeIdempotentResponse,
} from '@/lib/idempotency';

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('readIdempotencyKey', () => {
  it('returns null when header is absent', () => {
    expect(readIdempotencyKey(new Request('http://x'))).toBeNull();
  });

  it('returns null for a non-UUID value', () => {
    const req = new Request('http://x', {
      headers: { 'idempotency-key': 'not-a-uuid' },
    });
    expect(readIdempotencyKey(req)).toBeNull();
  });

  it('returns the key for a valid v4 UUID', () => {
    const uuid = '0a1d2e3f-1234-4abc-8def-0123456789ab';
    const req = new Request('http://x', { headers: { 'idempotency-key': uuid } });
    expect(readIdempotencyKey(req)).toBe(uuid);
  });

  it('trims whitespace', () => {
    const uuid = '0a1d2e3f-1234-4abc-8def-0123456789ab';
    const req = new Request('http://x', {
      headers: { 'idempotency-key': `  ${uuid}  ` },
    });
    expect(readIdempotencyKey(req)).toBe(uuid);
  });
});

describe('hashRequestBody', () => {
  it('produces stable hex digests', () => {
    const a = hashRequestBody({ a: 1, b: 2 });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRequestBody({ a: 1, b: 2 })).toBe(a);
  });

  it('is order-invariant on top-level keys', () => {
    expect(hashRequestBody({ a: 1, b: 2 })).toBe(hashRequestBody({ b: 2, a: 1 }));
  });

  it('changes when values change', () => {
    expect(hashRequestBody({ a: 1 })).not.toBe(hashRequestBody({ a: 2 }));
  });
});

describe('checkIdempotency / storeIdempotentResponse', () => {
  // Lightweight in-memory mock of the Prisma client surface we use.
  function makePrisma() {
    const rows: Array<{
      scope: string;
      key: string;
      requestHash: string;
      responseBody: unknown;
      statusCode: number;
      expiresAt: Date;
    }> = [];

    return {
      _rows: rows,
      idempotencyKey: {
        async findUnique({ where }: { where: { scope_key: { scope: string; key: string } } }) {
          const found = rows.find(
            (r) => r.scope === where.scope_key.scope && r.key === where.scope_key.key,
          );
          return found ?? null;
        },
        async delete({ where }: { where: { scope_key: { scope: string; key: string } } }) {
          const idx = rows.findIndex(
            (r) => r.scope === where.scope_key.scope && r.key === where.scope_key.key,
          );
          if (idx >= 0) rows.splice(idx, 1);
          return null;
        },
        async create({ data }: { data: typeof rows[number] }) {
          rows.push(data);
          return data;
        },
      },
    };
  }

  type FakePrisma = ReturnType<typeof makePrisma>;

  it('returns "fresh" when no key has been stored', async () => {
    const p = makePrisma();
    const r = await checkIdempotency(p as unknown as never, 'scope', 'k', 'h');
    expect(r.kind).toBe('fresh');
  });

  it('returns "replay" with the cached body when the request hash matches', async () => {
    const p = makePrisma();
    await storeIdempotentResponse(p as unknown as never, 'scope', 'k', 'h', {
      statusCode: 201,
      body: { ok: true },
    });
    const r = await checkIdempotency(p as unknown as never, 'scope', 'k', 'h');
    expect(r.kind).toBe('replay');
    if (r.kind === 'replay') {
      expect(r.cached.statusCode).toBe(201);
      expect(r.cached.body).toEqual({ ok: true });
    }
  });

  it('returns "conflict" when the key was reused with a different body hash', async () => {
    const p = makePrisma();
    await storeIdempotentResponse(p as unknown as never, 'scope', 'k', 'h-orig', {
      statusCode: 201,
      body: { ok: true },
    });
    const r = await checkIdempotency(p as unknown as never, 'scope', 'k', 'h-different');
    expect(r.kind).toBe('conflict');
  });

  it('treats expired records as fresh and removes them', async () => {
    const p: FakePrisma = makePrisma();
    p._rows.push({
      scope: 'scope',
      key: 'k',
      requestHash: 'h',
      responseBody: {},
      statusCode: 201,
      expiresAt: new Date(Date.now() - 1000),
    });
    const r = await checkIdempotency(p as unknown as never, 'scope', 'k', 'h');
    expect(r.kind).toBe('fresh');
    expect(p._rows).toHaveLength(0);
  });
});
