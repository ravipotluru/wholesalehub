import crypto from 'crypto';

/**
 * Timing-safe equality for hex-encoded signatures of equal length. Returns
 * `false` immediately on length mismatch (which is itself non-secret) and
 * uses `crypto.timingSafeEqual` for the byte-by-byte compare.
 *
 * NEVER replace with `===`: short-circuit equality leaks the per-byte
 * comparison time, letting an attacker recover the signature one byte at a time.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Compute an HMAC-SHA256 hex digest of `body` with `secret`. */
export function hmacSha256Hex(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
