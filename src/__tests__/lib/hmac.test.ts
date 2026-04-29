import { hmacSha256Hex, timingSafeEqualHex } from '@/lib/hmac';

describe('hmacSha256Hex', () => {
  it('produces a stable HMAC-SHA256 hex digest for the same secret and body', () => {
    const secret = 'super-secret';
    const body = '{"hello":"world"}';
    const sig = hmacSha256Hex(secret, body);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacSha256Hex(secret, body)).toBe(sig);
  });

  it('produces a different digest when the secret changes', () => {
    const a = hmacSha256Hex('k1', 'body');
    const b = hmacSha256Hex('k2', 'body');
    expect(a).not.toBe(b);
  });

  it('produces a different digest when the body changes', () => {
    const a = hmacSha256Hex('k', 'a');
    const b = hmacSha256Hex('k', 'b');
    expect(a).not.toBe(b);
  });
});

describe('timingSafeEqualHex', () => {
  it('returns true for equal hex strings', () => {
    const sig = hmacSha256Hex('k', 'body');
    expect(timingSafeEqualHex(sig, sig)).toBe(true);
  });

  it('returns false on length mismatch without throwing', () => {
    expect(timingSafeEqualHex('abcd', 'abcdef')).toBe(false);
  });

  it('returns false for equal-length but different hex strings', () => {
    expect(
      timingSafeEqualHex(
        '0'.repeat(64),
        '1'.repeat(64),
      ),
    ).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(timingSafeEqualHex(undefined as unknown as string, 'abc')).toBe(false);
    expect(timingSafeEqualHex('abc', null as unknown as string)).toBe(false);
  });

  it('returns false for malformed hex of equal length', () => {
    // Same length but not valid hex; Buffer.from('zzzz','hex') returns empty
    // — guard should still produce false rather than throwing.
    expect(timingSafeEqualHex('zzzz', 'zzzz')).toBe(false);
  });
});
