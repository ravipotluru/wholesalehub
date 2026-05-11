import pino from 'pino';

/**
 * Field paths to redact from every log line. Use the `*.path` form so the
 * redaction reaches into nested context objects (the most common pattern is
 * `logger.warn({ event, email })`). Pino redaction is depth-1 unless you use
 * the `*` wildcard prefix, so we list both the top-level and one-level-deep
 * variants for the fields we actually log.
 *
 * Email is partially masked (keeps the domain) so log-grep on a domain still
 * works for an incident review; password/token/secret are fully removed.
 */
const REDACT_PATHS = [
  // Authentication / credentials
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  '*.password',
  '*.passwordHash',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
  'secret',
  '*.secret',
  'webhookSecret',
  '*.webhookSecret',
  // Stripe — Stripe.js client_secret is not catastrophic but not for logs
  'clientSecret',
  '*.clientSecret',
  'stripeSecretKey',
  '*.stripeSecretKey',
  // Personal data — emails masked, phone redacted
  'phone',
  '*.phone',
  'creditCard',
  '*.creditCard',
];

/**
 * Email masking censor — keeps the first character and the domain.
 * `alice@example.com` → `a***@example.com`.
 * Used for fields whose redaction path returns the *value* (not a key).
 */
function maskEmail(value: unknown): unknown {
  if (typeof value !== 'string') return '[redacted]';
  const at = value.indexOf('@');
  if (at <= 0) return '[redacted]';
  return value[0] + '***' + value.slice(at);
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'wholesalehub',
    env: process.env.NODE_ENV,
  },
  redact: {
    paths: REDACT_PATHS,
    censor: '[redacted]',
    remove: false,
  },
  // Email gets its own censor that preserves the domain.
  // Pino allows multiple `redact` configs only via separate hooks, so we
  // post-process via `serializers`. The `email` serializer fires whenever a
  // top-level `email` key is logged.
  serializers: {
    email: maskEmail,
  },
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  }),
});
