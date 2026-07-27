import crypto from 'crypto';

const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Timing-safe equality for hex-encoded signatures of equal length. Returns
 * `false` immediately on length mismatch or malformed hex (both of which are
 * properties of the attacker-supplied input, not the secret) and uses
 * `crypto.timingSafeEqual` for the byte-by-byte compare.
 *
 * Both inputs must be non-empty, even-length, well-formed hex before decoding:
 * `Buffer.from(str, 'hex')` silently truncates at the first invalid character
 * (and yields an empty buffer for fully invalid input), so without this guard
 * equal-length malformed inputs could collide after decode — e.g.
 * `Buffer.from('zzzz', 'hex')` is empty for both sides and would compare equal.
 *
 * NEVER replace with `===`: short-circuit equality leaks the per-byte
 * comparison time, letting an attacker recover the signature one byte at a time.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  if (a.length === 0 || a.length % 2 !== 0) return false;
  const aValid = HEX_RE.test(a);
  const bValid = HEX_RE.test(b);
  if (!aValid || !bValid) return false;
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  try {
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/** Compute an HMAC-SHA256 hex digest of `body` with `secret`. */
export function hmacSha256Hex(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
