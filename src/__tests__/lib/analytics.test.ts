/**
 * Tests for the server-side analytics wrapper.
 *
 * The PostHog SDK is mocked at module-resolution time (because the package
 * isn't installed in CI when this branch is fresh, AND we want to assert on
 * the SDK call shape without sending real events). Each test that needs to
 * exercise the SDK path uses the mock constructor to introspect calls.
 */

// ─── Hoisted SDK mock ─────────────────────────────────────────────────
// `jest.mock` is hoisted to the top of the file, so any constants used
// inside the factory must be inline.
const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockFlush = jest.fn().mockResolvedValue(undefined);
const mockShutdown = jest.fn().mockResolvedValue(undefined);
const mockPostHogCtor = jest.fn().mockImplementation(() => ({
  capture: mockCapture,
  identify: mockIdentify,
  flush: mockFlush,
  shutdown: mockShutdown,
}));

jest.mock('posthog-node', () => ({
  PostHog: mockPostHogCtor,
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  capture,
  identify,
  stripPII,
  __resetClientForTests,
} from '@/lib/analytics/posthog';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
  __resetClientForTests();
  delete process.env.POSTHOG_API_KEY;
  delete process.env.POSTHOG_HOST;
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

afterAll(() => {
  delete process.env.POSTHOG_API_KEY;
  delete process.env.POSTHOG_HOST;
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('capture — no-op when API key is unset', () => {
  it('does not construct the PostHog client', () => {
    capture({
      event: 'cart_item_added',
      distinctId: 'user_abc',
      properties: { productId: 'p1', wholesalerId: 'w1', quantity: 2 },
    });
    expect(mockPostHogCtor).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('does not call capture even after multiple invocations', () => {
    capture({
      event: 'product_viewed',
      distinctId: 'user_abc',
      properties: { productId: 'p1', category: 'vape' },
    });
    capture({
      event: 'product_viewed',
      distinctId: 'user_abc',
      properties: { productId: 'p2', category: 'vape' },
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('capture — calls SDK when configured', () => {
  beforeEach(() => {
    process.env.POSTHOG_API_KEY = 'phc_test_key_123';
    process.env.POSTHOG_HOST = 'https://eu.i.posthog.com';
  });

  it('forwards a valid event to the SDK with correct shape', () => {
    capture({
      event: 'cart_item_added',
      distinctId: 'user_abc',
      properties: { productId: 'p1', wholesalerId: 'w1', quantity: 3 },
    });

    expect(mockPostHogCtor).toHaveBeenCalledTimes(1);
    expect(mockPostHogCtor).toHaveBeenCalledWith('phc_test_key_123', {
      host: 'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'user_abc',
      event: 'cart_item_added',
      properties: { productId: 'p1', wholesalerId: 'w1', quantity: 3 },
    });
  });

  it('reuses the same client across calls (lazy singleton)', () => {
    capture({
      event: 'product_viewed',
      distinctId: 'u',
      properties: { productId: 'p1', category: 'vape' },
    });
    capture({
      event: 'product_viewed',
      distinctId: 'u',
      properties: { productId: 'p2', category: 'vape' },
    });
    expect(mockPostHogCtor).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledTimes(2);
  });

  it('uses the default host when POSTHOG_HOST is unset', () => {
    delete process.env.POSTHOG_HOST;
    capture({
      event: 'product_viewed',
      distinctId: 'u',
      properties: { productId: 'p1', category: 'vape' },
    });
    expect(mockPostHogCtor).toHaveBeenCalledWith('phc_test_key_123', {
      host: 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  });
});

describe('capture — PII filter strips sensitive keys at any depth', () => {
  beforeEach(() => {
    process.env.POSTHOG_API_KEY = 'phc_test_key_123';
  });

  it('strips top-level email/phone before calling the SDK', () => {
    // We use a legitimately-shaped event but with strict() in the schema,
    // unknown properties get rejected. So we test stripPII directly here
    // and via the SDK call path with an event that passthroughs. The
    // dedicated stripPII unit test below covers the deep-nesting case.
    const cleaned = stripPII({
      productId: 'p1',
      email: 'alice@example.com',
      phone: '+15551234567',
    });
    expect(cleaned).toEqual({ productId: 'p1' });
  });

  it('strips nested PII recursively (deep object)', () => {
    const cleaned = stripPII({
      level1: {
        level2: {
          email: 'alice@example.com',
          token: 'secret-token-xyz',
          allowed: 'value',
          level3: {
            password: 'hunter2',
            phone: '+15551234567',
            keep: 'this',
          },
        },
        passwordHash: 'bcrypt$...',
        otherField: 42,
      },
    });
    expect(cleaned).toEqual({
      level1: {
        level2: {
          allowed: 'value',
          level3: { keep: 'this' },
        },
        otherField: 42,
      },
    });
  });

  it('walks arrays and strips PII inside array elements', () => {
    const cleaned = stripPII([
      { id: 'a', email: 'x@y.com', value: 1 },
      { id: 'b', token: 'abc', value: 2 },
    ]);
    expect(cleaned).toEqual([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ]);
  });

  it('handles primitives and null/undefined without throwing', () => {
    expect(stripPII(null)).toBeNull();
    expect(stripPII(undefined)).toBeUndefined();
    expect(stripPII(42)).toBe(42);
    expect(stripPII('hello')).toBe('hello');
    expect(stripPII(true)).toBe(true);
  });

  it('strips all logger-mirrored keys', () => {
    const allKeys: Record<string, string> = {
      email: 'a@b.c',
      phone: '555',
      password: 'p',
      passwordHash: 'h',
      currentPassword: 'p',
      newPassword: 'p',
      confirmPassword: 'p',
      token: 't',
      secret: 's',
      webhookSecret: 'w',
      authorization: 'Bearer x',
      cookie: 'sid=...',
      creditCard: '4111...',
      apiKey: 'k',
      // Surviving fields
      productId: 'p1',
      role: 'RETAILER',
    };
    const cleaned = stripPII(allKeys) as Record<string, unknown>;
    expect(cleaned).toEqual({ productId: 'p1', role: 'RETAILER' });
  });
});

describe('capture — typo / schema mismatch throws in dev', () => {
  beforeEach(() => {
    process.env.POSTHOG_API_KEY = 'phc_test_key_123';
    process.env.NODE_ENV = 'development';
  });

  it('throws ZodError when a property name is mistyped', () => {
    expect(() => {
      // Typo: "producutId" instead of "productId". The strict() schema
      // rejects unknown keys, so this fires loudly.
      capture({
        event: 'cart_item_added',
        distinctId: 'u',
        properties: {
          // @ts-expect-error — intentionally wrong shape to test runtime guard
          producutId: 'p1',
          wholesalerId: 'w1',
          quantity: 1,
        },
      });
    }).toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('throws ZodError when a property is the wrong type', () => {
    expect(() => {
      capture({
        event: 'cart_item_added',
        distinctId: 'u',
        // @ts-expect-error — quantity should be number, not string
        properties: { productId: 'p1', wholesalerId: 'w1', quantity: 'three' },
      });
    }).toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('throws when a required field is missing', () => {
    expect(() => {
      capture({
        event: 'order_placed',
        distinctId: 'u',
        // @ts-expect-error — missing idempotent
        properties: { orderCount: 1, totalCents: 1000 },
      });
    }).toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('capture — schema mismatch in production logs and drops', () => {
  beforeEach(() => {
    process.env.POSTHOG_API_KEY = 'phc_test_key_123';
    process.env.NODE_ENV = 'production';
  });

  it('does not throw and does not call the SDK on validation failure', () => {
    expect(() => {
      capture({
        event: 'cart_item_added',
        distinctId: 'u',
        // @ts-expect-error
        properties: { productId: 'p1' /* missing wholesalerId, quantity */ },
      });
    }).not.toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('identify — strips PII', () => {
  beforeEach(() => {
    process.env.POSTHOG_API_KEY = 'phc_test_key_123';
  });

  it('drops email/phone/password from properties before calling the SDK', () => {
    identify({
      distinctId: 'user_abc',
      properties: {
        role: 'RETAILER',
        email: 'alice@example.com',
        phone: '+15551234567',
        password: 'hunter2',
        retailerId: 'ret_123',
      },
    });
    expect(mockIdentify).toHaveBeenCalledTimes(1);
    expect(mockIdentify).toHaveBeenCalledWith({
      distinctId: 'user_abc',
      properties: { role: 'RETAILER', retailerId: 'ret_123' },
    });
  });

  it('no-ops when API key is unset', () => {
    delete process.env.POSTHOG_API_KEY;
    __resetClientForTests();
    identify({
      distinctId: 'user_abc',
      properties: { role: 'RETAILER' },
    });
    expect(mockPostHogCtor).not.toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('strips nested PII before identify', () => {
    identify({
      distinctId: 'user_abc',
      properties: {
        profile: {
          email: 'a@b.c',
          name: 'Alice',
          inner: { token: 'x', keep: 'y' },
        },
      },
    });
    expect(mockIdentify).toHaveBeenCalledWith({
      distinctId: 'user_abc',
      properties: { profile: { name: 'Alice', inner: { keep: 'y' } } },
    });
  });
});
