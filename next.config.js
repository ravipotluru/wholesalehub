/** @type {import('next').NextConfig} */

/**
 * Production security headers.
 *
 * - CSP: strict default-src 'self'; allow inline styles for Tailwind/JIT and
 *   inline scripts that Next emits for hydration. `frame-ancestors 'none'`
 *   prevents clickjacking even on browsers that ignore X-Frame-Options.
 * - HSTS: assumes HTTPS-only in production (Vercel/CDN terminates TLS).
 * - Permissions-Policy: lock down sensors/camera by default.
 *
 * Tighten further in a later pass once we've confirmed the marketplace
 * doesn't load fonts/images from new origins.
 */
const isProd = process.env.NODE_ENV === 'production';

const ContentSecurityPolicy = [
  "default-src 'self'",
  // Next.js inlines small bootstrap scripts; allow inline + eval for dev-mode HMR.
  isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.github.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  isProd ? 'upgrade-insecure-requests' : '',
]
  .filter(Boolean)
  .join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['pino', 'pino-pretty'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

/**
 * Sentry build-time configuration.
 *
 * `withSentryConfig` augments the Next config with source-map upload and
 * tunnel routing. It runs only when `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` +
 * `SENTRY_PROJECT` are all set, otherwise it falls through to a no-op so
 * CI builds without Sentry credentials still succeed. `silent: true` and
 * `dryRun` together suppress the "missing auth token" warning that would
 * otherwise pollute every local `next build`.
 *
 * The headers/CSP config above is preserved unchanged — `withSentryConfig`
 * does not modify `headers()`, only build/source-map options.
 */
const sentryConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Silent in CI/local dev when the auth token is missing — avoids spamming
  // every build with "Sentry CLI not configured" warnings.
  silent: !sentryConfigured,
  // Dry-run when no auth token is present so source-map upload no-ops
  // instead of failing the build.
  dryRun: !sentryConfigured,
  // Hide source maps from the final bundle in production.
  hideSourceMaps: true,
  // Don't bundle the Sentry CLI at runtime.
  disableLogger: true,
};

let withSentryConfig;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  ({ withSentryConfig } = require('@sentry/nextjs'));
} catch {
  // Package not installed yet (e.g. fresh checkout before `npm install`).
  // Export the bare config so the build still succeeds.
  withSentryConfig = null;
}

module.exports = withSentryConfig
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
