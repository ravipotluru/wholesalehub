/**
 * Tests for `src/lib/sentry.ts` and `src/lib/sentry-pii.ts`.
 *
 * The Sentry SDK is mocked so we don't need a real DSN or network. The
 * "DSN unset" case is simulated by `getClient` returning `undefined`
 * (which is what the real SDK does before `Sentry.init({...})` runs).
 */

// Mock state — flipped per-test to simulate "DSN set / unset".
const sdkState = {
  initialized: false,
  captured: [] as Array<{ error: unknown; tags: Record<string, unknown>; contexts: Record<string, unknown> }>,
  user: null as null | Record<string, unknown>,
};

interface FakeScope {
  setTag: (k: string, v: unknown) => FakeScope;
  setContext: (k: string, v: Record<string, unknown>) => FakeScope;
}

jest.mock('@sentry/nextjs', () => {
  return {
    getClient: () => (sdkState.initialized ? { fake: true } : undefined),
    captureException: jest.fn((error: unknown) => {
      // Pull the most-recent scope from the withScope stack via a side
      // channel — see `withScope` below.
      const last = sdkState.captured[sdkState.captured.length - 1];
      if (last) last.error = error;
      return 'event-id-123';
    }),
    withScope: (fn: (scope: FakeScope) => string | undefined) => {
      const tags: Record<string, unknown> = {};
      const contexts: Record<string, unknown> = {};
      sdkState.captured.push({ error: undefined, tags, contexts });
      const scope: FakeScope = {
        setTag: (k, v) => {
          tags[k] = v;
          return scope;
        },
        setContext: (k, v) => {
          contexts[k] = v;
          return scope;
        },
      };
      return fn(scope);
    },
    setUser: jest.fn((user: null | Record<string, unknown>) => {
      sdkState.user = user;
    }),
  };
});

import { captureApiError, setUserContext } from '@/lib/sentry';
import { scrubEvent, type SentryEventLike } from '@/lib/sentry-pii';

describe('captureApiError', () => {
  beforeEach(() => {
    sdkState.initialized = false;
    sdkState.captured = [];
    sdkState.user = null;
    jest.clearAllMocks();
  });

  it('no-ops when the SDK is not initialized (DSN unset)', () => {
    sdkState.initialized = false;

    const result = captureApiError(new Error('boom'), { route: 'orders.id' });

    expect(result).toBeUndefined();
    expect(sdkState.captured).toHaveLength(0);
  });

  it('captures the exception with route + userId tags when the SDK is initialized', () => {
    sdkState.initialized = true;
    const err = new Error('db connection refused');

    const result = captureApiError(err, {
      route: 'orders.id',
      userId: 'u_abc123',
      requestId: 'req_xyz',
      extra: { orderId: 'o_42' },
    });

    expect(result).toBe('event-id-123');
    expect(sdkState.captured).toHaveLength(1);
    expect(sdkState.captured[0].error).toBe(err);
    expect(sdkState.captured[0].tags).toEqual({
      route: 'orders.id',
      userId: 'u_abc123',
      requestId: 'req_xyz',
    });
    expect(sdkState.captured[0].contexts).toEqual({
      extra: { orderId: 'o_42' },
    });
  });

  it('omits userId / requestId tags when not provided', () => {
    sdkState.initialized = true;

    captureApiError(new Error('x'), { route: 'orders.id' });

    expect(sdkState.captured).toHaveLength(1);
    expect(sdkState.captured[0].tags).toEqual({ route: 'orders.id' });
    expect(sdkState.captured[0].contexts).toEqual({});
  });
});

describe('setUserContext', () => {
  beforeEach(() => {
    sdkState.initialized = false;
    sdkState.user = null;
    jest.clearAllMocks();
  });

  it('no-ops when the SDK is not initialized', () => {
    sdkState.initialized = false;

    setUserContext({ id: 'u_1', role: 'RETAILER' });

    expect(sdkState.user).toBeNull();
  });

  it('sets id + role on the Sentry user, never email', () => {
    sdkState.initialized = true;

    setUserContext({ id: 'u_1', role: 'RETAILER' });

    expect(sdkState.user).toEqual({ id: 'u_1', role: 'RETAILER' });
    expect(sdkState.user).not.toHaveProperty('email');
  });

  it('passes null through to clear the user on logout', () => {
    sdkState.initialized = true;
    sdkState.user = { id: 'u_1', role: 'RETAILER' };

    setUserContext(null);

    expect(sdkState.user).toBeNull();
  });
});

describe('scrubEvent (PII filter)', () => {
  it('strips password / token / secret / webhookSecret keys at any depth', () => {
    const event: SentryEventLike = {
      request: {
        headers: { authorization: 'Bearer abc.def.ghi', cookie: 'session=xyz' },
        data: {
          username: 'alice',
          password: 'hunter2',
          token: 'jwt-here',
          secret: 'shhhh',
          webhookSecret: 'whsec_value',
        },
      },
      extra: {
        nested: {
          apiKey: 'sk_live_xxx',
          passwordHash: '$2b$10$xxxx',
        },
      },
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.headers).toEqual({
      authorization: '[redacted]',
      cookie: '[redacted]',
    });
    expect(scrubbed.request?.data).toEqual({
      username: 'alice',
      password: '[redacted]',
      token: '[redacted]',
      secret: '[redacted]',
      webhookSecret: '[redacted]',
    });
    expect(scrubbed.extra?.nested).toEqual({
      apiKey: '[redacted]',
      passwordHash: '[redacted]',
    });
  });

  it('partially masks email keys (keeps domain)', () => {
    const event: SentryEventLike = {
      user: {
        id: 'u_42',
        email: 'alice@suppliercorp.com',
        role: 'RETAILER',
      },
      extra: {
        contact: { email: 'bob@gas-station.example' },
      },
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.user?.email).toBe('a***@suppliercorp.com');
    expect((scrubbed.extra?.contact as Record<string, unknown>).email).toBe(
      'b***@gas-station.example',
    );
    // Non-PII fields untouched.
    expect(scrubbed.user?.id).toBe('u_42');
    expect(scrubbed.user?.role).toBe('RETAILER');
  });

  it('redacts inside arrays and is case-insensitive on key names', () => {
    const event: SentryEventLike = {
      breadcrumbs: [
        { category: 'http', data: { Email: 'carol@x.com', Password: 'p' } },
        { category: 'auth', data: { TOKEN: 't', other: 'ok' } },
      ],
    };

    const scrubbed = scrubEvent(event);

    const b0 = scrubbed.breadcrumbs?.[0]?.data as Record<string, unknown>;
    const b1 = scrubbed.breadcrumbs?.[1]?.data as Record<string, unknown>;
    expect(b0.Email).toBe('c***@x.com');
    expect(b0.Password).toBe('[redacted]');
    expect(b1.TOKEN).toBe('[redacted]');
    expect(b1.other).toBe('ok');
  });

  it('returns a copy without mutating the input', () => {
    const event: SentryEventLike = {
      user: { email: 'alice@x.com', id: 'u_1' },
    };
    const before = JSON.stringify(event);

    scrubEvent(event);

    expect(JSON.stringify(event)).toBe(before);
  });

  it('does not lose non-PII top-level fields', () => {
    const event: SentryEventLike = {
      tags: { release: 'wholesalehub@dev', route: 'orders.id' },
      extra: { orderId: 'o_42' },
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.tags).toEqual({
      release: 'wholesalehub@dev',
      route: 'orders.id',
    });
    expect(scrubbed.extra).toEqual({ orderId: 'o_42' });
  });
});
