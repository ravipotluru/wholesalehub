/**
 * @jest-environment node
 */
// Mock the Redis client BEFORE importing the SUT. The factory must be
// self-contained: jest.mock calls are hoisted above variable declarations,
// so it must not close over outer variables.
jest.mock('@/lib/redis', () => ({
  redis: {
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { redis } from '@/lib/redis';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const mockRedis = redis as jest.Mocked<typeof redis>;

describe('rateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests under the limit', async () => {
    mockRedis.incr.mockResolvedValueOnce(1);
    mockRedis.expire.mockResolvedValueOnce(1);
    mockRedis.ttl.mockResolvedValueOnce(60);

    const result = await rateLimit({ key: 'k', limit: 3, windowSec: 60 });

    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(2);
    // First call should set expiry on the new key.
    expect(mockRedis.expire).toHaveBeenCalledWith('rl:k', 60);
  });

  it('does not call expire on subsequent increments in the same window', async () => {
    mockRedis.incr.mockResolvedValueOnce(2);
    mockRedis.ttl.mockResolvedValueOnce(45);

    await rateLimit({ key: 'k', limit: 3, windowSec: 60 });
    expect(mockRedis.expire).not.toHaveBeenCalled();
  });

  it('rejects when the limit is exceeded', async () => {
    mockRedis.incr.mockResolvedValueOnce(4);
    mockRedis.ttl.mockResolvedValueOnce(20);

    const result = await rateLimit({ key: 'k', limit: 3, windowSec: 60 });

    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetSec).toBe(20);
  });

  it('fails open when Redis is unavailable', async () => {
    mockRedis.incr.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await rateLimit({ key: 'k', limit: 3, windowSec: 60 });

    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(3);
    expect(result.resetSec).toBe(60);
  });
});

describe('clientIp', () => {
  it('reads the first IP from x-forwarded-for', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(clientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const req = new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } });
    expect(clientIp(req)).toBe('9.9.9.9');
  });

  it('returns "unknown" when neither header is present', () => {
    const req = new Request('http://x');
    expect(clientIp(req)).toBe('unknown');
  });
});
