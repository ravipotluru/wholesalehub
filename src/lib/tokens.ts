import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { AuthTokenType } from '@prisma/client';

/**
 * Single-use, hashed auth tokens (email verification + password reset).
 *
 * Threat model: the auth_tokens table must be useless to an attacker with
 * read access — so we store SHA-256(token), never the token. The raw token
 * exists exactly once, inside the emailed link, and is consumed on first use.
 */

const TOKEN_BYTES = 32;

export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000, // 24h — matches copy on /verify-email
  PASSWORD_RESET: 30 * 60 * 1000, // 30min — matches copy on /reset-password
};

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Issue a fresh token for (userId, type), invalidating any still-unused
 * predecessors so only the newest emailed link works. Returns the RAW token
 * for the email link — the caller must not store it.
 */
export async function issueToken(userId: string, type: AuthTokenType): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString('base64url');
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.authToken.updateMany({
      where: { userId, type, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    await tx.authToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(raw),
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[type]),
      },
    });
  });

  return raw;
}

export interface ConsumedToken {
  userId: string;
}

/**
 * Atomically consume a raw token. Returns the owning userId, or null when
 * the token is unknown, expired, wrong type, or already used. updateMany
 * with the full predicate makes the use-once check race-safe: two
 * concurrent requests can't both see count === 1.
 */
export async function consumeToken(
  raw: string,
  type: AuthTokenType,
): Promise<ConsumedToken | null> {
  const tokenHash = hashToken(raw);
  const now = new Date();

  const updated = await prisma.authToken.updateMany({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (updated.count !== 1) return null;

  const row = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });
  return row ? { userId: row.userId } : null;
}
