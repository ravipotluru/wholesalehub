import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { logger } from '@/lib/logger';
import { getResendClient } from './client';

/**
 * Arguments for `sendEmail`. Stays close to Resend's own surface so the
 * adapter overhead is near zero, but we own the type so swapping providers
 * later is a single-file refactor.
 */
export interface SendEmailArgs {
  to: string | string[];
  from: string;
  subject: string;
  /** React Email template element. Renders to both HTML + plain text. */
  react: ReactElement;
  replyTo?: string;
  /**
   * Logical event name surfaced in structured logs alongside `email_sent`.
   * E.g. `'order_confirmation'`, `'license_expiring'`. Useful for grepping.
   */
  tag?: string;
}

/**
 * Outcome of a send attempt. Returned (never thrown) so the caller can
 * decide whether to retry, alert, or do nothing.
 */
export type SendEmailResult =
  | { ok: true; id: string | null; skipped?: false }
  | { ok: true; id: null; skipped: true; reason: 'no_api_key' }
  | { ok: false; error: string };

/**
 * Render + send a transactional email. Never throws — caller decides what
 * to do with a failure (the order POST path simply logs and moves on).
 *
 * Behavior:
 * - When `RESEND_API_KEY` is unset: emits `email_skipped_no_api_key` and
 *   returns `{ ok: true, skipped: true }`. Dev/CI never need a real key.
 * - On success: emits `email_sent` (with masked recipient) and returns
 *   the Resend message id.
 * - On failure: emits `email_failed` (with redacted error message) and
 *   returns `{ ok: false }`. No throw.
 *
 * SECURITY note: subject lines should NOT contain the recipient's email
 * address — log redaction masks the `email` field but a subject string
 * is logged verbatim.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const client = getResendClient();

  // Render once so both code paths (skip-log and real-send) get the same
  // serialised payload. `render()` is sync-safe for our templates.
  let html: string;
  let text: string;
  try {
    html = await render(args.react);
    text = await render(args.react, { plainText: true });
  } catch (error) {
    logger.error({
      event: 'email_render_failed',
      tag: args.tag,
      subject: args.subject,
      error: (error as Error).message,
    });
    return { ok: false, error: 'render_failed' };
  }

  if (!client) {
    logger.info({
      event: 'email_skipped_no_api_key',
      tag: args.tag,
      subject: args.subject,
      // The pino `email` serializer masks this to `a***@domain.com`.
      email: Array.isArray(args.to) ? args.to[0] : args.to,
    });
    return { ok: true, id: null, skipped: true, reason: 'no_api_key' };
  }

  try {
    const { data, error } = await client.emails.send({
      to: args.to,
      from: args.from,
      subject: args.subject,
      html,
      text,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    });

    if (error) {
      logger.error({
        event: 'email_failed',
        tag: args.tag,
        subject: args.subject,
        email: Array.isArray(args.to) ? args.to[0] : args.to,
        error: error.message,
      });
      return { ok: false, error: error.message };
    }

    logger.info({
      event: 'email_sent',
      tag: args.tag,
      subject: args.subject,
      email: Array.isArray(args.to) ? args.to[0] : args.to,
      messageId: data?.id ?? null,
    });

    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    logger.error({
      event: 'email_failed',
      tag: args.tag,
      subject: args.subject,
      email: Array.isArray(args.to) ? args.to[0] : args.to,
      error: (error as Error).message,
    });
    return { ok: false, error: (error as Error).message };
  }
}
