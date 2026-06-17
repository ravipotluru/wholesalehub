import { Resend } from 'resend';
import { logger } from '@/lib/logger';

/**
 * Resend client singleton.
 *
 * Fail-soft when `RESEND_API_KEY` is unset: we expose `null` and the caller
 * (`sendEmail`) skips the network call and emits a structured log line. This
 * mirrors the project's "no external creds in dev/CI" pattern (cf. AWS
 * Bedrock falls back to deterministic mocks when AWS creds are absent — see
 * `src/lib/embeddings.ts`).
 *
 * Production deploys MUST set `RESEND_API_KEY`; missing it should be flagged
 * by the deploy checklist, not by a runtime crash on the order POST path.
 */
let cachedClient: Resend | null | undefined;

/**
 * Get the configured Resend client, or `null` if `RESEND_API_KEY` is unset.
 *
 * The client is cached for the process lifetime — Resend's SDK is a thin
 * fetch wrapper, no connection pool to tear down.
 */
export function getResendClient(): Resend | null {
  if (cachedClient !== undefined) return cachedClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    logger.info({
      event: 'email_skipped_no_api_key',
      reason: 'RESEND_API_KEY is unset; email transport is no-op.',
    });
    cachedClient = null;
    return null;
  }

  cachedClient = new Resend(apiKey);
  return cachedClient;
}

/**
 * Reset the cached client. Tests use this between cases to swap env vars.
 * Not exported from a barrel — only the email test reaches for it.
 */
export function __resetResendClientForTests(): void {
  cachedClient = undefined;
}
