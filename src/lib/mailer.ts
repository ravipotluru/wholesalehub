import { logger } from '@/lib/logger';

/**
 * Outbound email. No SMTP/SES dependency is wired yet, so this module is
 * the single seam where a real transport plugs in later (SES via
 * @aws-sdk/client-ses, or Resend). Until then:
 *
 *  - In development, the full action link is logged so flows are testable
 *    end-to-end from the dev console.
 *  - In production, we log the event WITHOUT the link (tokens must not
 *    land in log storage) so ops can see sends are attempted.
 *
 * Every caller must treat sends as fire-and-forget best-effort — auth flows
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

export async function sendActionEmail(mail: ActionEmail): Promise<void> {
  // TODO(transport): SES/Resend integration. Until then, log-only.
  if (process.env.NODE_ENV === 'production') {
    logger.info({
      event: 'email_send_attempted',
      kind: mail.kind,
      to: mail.to, // pino email serializer masks this
      transport: 'none-configured',
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
