import { logger } from '@/lib/logger';

/**
 * Outbound email. Transport is env-gated:
 *
 *  - RESEND_API_KEY set  -> send via Resend's REST API (plain fetch, no SDK
 *    dependency). EMAIL_FROM controls the sender identity.
 *  - RESEND_API_KEY absent -> dev/demo fallback: log the send. In
 *    development the full action link is logged so flows are testable from
 *    the console; in production the link is withheld (tokens must never
 *    land in log storage).
 *
 * Every caller treats sends as fire-and-forget best-effort — auth flows
 * never fail because email failed.
 */

interface ActionEmail {
  to: string;
  subject: string;
  /** One-line purpose for the log, e.g. "password_reset". */
  kind: string;
  /** The action link. NEVER logged in production. */
  actionUrl: string;
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'
  );
}

function renderActionHtml(mail: ActionEmail): string {
  // Deliberately spartan table-free HTML — renders fine in every client and
  // keeps us out of template-engine territory until a designer owns emails.
  return [
    '<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
    '<p style="font-size:16px;font-weight:700;color:#1E4D8C;margin:0 0 4px">WholesaleHub</p>',
    `<p style="font-size:14px;color:#2D3436;line-height:1.6">${mail.subject}</p>`,
    `<p style="margin:24px 0"><a href="${mail.actionUrl}" style="background:#FF6A00;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">Continue</a></p>`,
    '<p style="font-size:12px;color:#6B7280;line-height:1.6">If the button does not work, copy this link into your browser:<br>',
    `<span style="word-break:break-all">${mail.actionUrl}</span></p>`,
    '<p style="font-size:11px;color:#9CA3AF">You received this because of activity on your WholesaleHub account. If this was not you, you can ignore this email.</p>',
    '</div>',
  ].join('');
}

export async function sendActionEmail(mail: ActionEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? 'WholesaleHub <onboarding@resend.dev>',
          to: [mail.to],
          subject: mail.subject,
          html: renderActionHtml(mail),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        logger.error({
          event: 'email_send_failed',
          kind: mail.kind,
          status: res.status,
          // Resend error bodies don't contain the recipient token link.
          detail: detail.slice(0, 300),
        });
        return;
      }
      logger.info({ event: 'email_sent', kind: mail.kind, transport: 'resend' });
    } catch (error) {
      logger.error({
        event: 'email_send_failed',
        kind: mail.kind,
        error: (error as Error).message,
      });
    }
    return;
  }

  // No transport configured.
  if (process.env.NODE_ENV === 'production') {
    logger.warn({
      event: 'email_send_skipped',
      kind: mail.kind,
      to: mail.to, // pino email serializer masks this
      reason: 'RESEND_API_KEY not configured',
    });
    return;
  }

  logger.info({
    event: 'email_send_dev',
    kind: mail.kind,
    to: mail.to,
    subject: mail.subject,
    actionUrl: mail.actionUrl,
  });
}
