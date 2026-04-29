import crypto from 'crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { logger } from './logger';

/** Stable representation of a cached idempotent response. */
export interface CachedResponse {
  statusCode: number;
  body: unknown;
}

/** RFC 4122 UUID format — what we accept as an Idempotency-Key value. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Default TTL for cached idempotent responses. */
const DEFAULT_TTL_HOURS = 24;

/** Read and validate the Idempotency-Key header on a request. */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get('idempotency-key');
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed;
}

/** Stable SHA-256 hash of a JSON-serialisable request body. */
export function hashRequestBody(body: unknown): string {
  const canonical = JSON.stringify(body, Object.keys(body as object).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export type IdempotencyOutcome =
  | { kind: 'replay'; cached: CachedResponse }
  | { kind: 'conflict' }
  | { kind: 'fresh' };

/**
 * Look up a stored response for `(scope, key)`. If found AND the body hash
 * matches, return it for replay. If found with a *different* hash, treat as
 * a client bug — return a `conflict` outcome the caller turns into 409.
 */
export async function checkIdempotency(
  prisma: PrismaClient | Prisma.TransactionClient,
  scope: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyOutcome> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope, key } },
  });
  if (!existing) return { kind: 'fresh' };
  if (existing.expiresAt < new Date()) {
    await prisma.idempotencyKey.delete({
      where: { scope_key: { scope, key } },
    });
    return { kind: 'fresh' };
  }
  if (existing.requestHash !== requestHash) {
    logger.warn({
      event: 'idempotency_key_conflict',
      scope,
      key,
    });
    return { kind: 'conflict' };
  }
  return {
    kind: 'replay',
    cached: {
      statusCode: existing.statusCode,
      body: existing.responseBody,
    },
  };
}

/** Persist the response for replay on subsequent retries. */
export async function storeIdempotentResponse(
  prisma: PrismaClient | Prisma.TransactionClient,
  scope: string,
  key: string,
  requestHash: string,
  response: CachedResponse,
  ttlHours: number = DEFAULT_TTL_HOURS,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await prisma.idempotencyKey.create({
    data: {
      scope,
      key,
      requestHash,
      responseBody: response.body as Prisma.InputJsonValue,
      statusCode: response.statusCode,
      expiresAt,
    },
  });
}
