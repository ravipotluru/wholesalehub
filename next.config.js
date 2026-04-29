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

module.exports = nextConfig;
