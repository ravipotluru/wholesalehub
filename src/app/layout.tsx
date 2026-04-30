import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { Providers } from './providers';

/**
 * Brand fonts — centralised, self-hosted via next/font/google.
 *
 * - `next/font` downloads the font files at build time and serves them
 *   from our origin, avoiding an extra DNS lookup + Google Fonts request
 *   on every page load. No FOUT.
 * - Each font exposes a CSS variable (`--font-sans`, `--font-mono`) that
 *   `tailwind.config.ts` reads — components use `font-sans` / `font-mono`
 *   utility classes, not hardcoded font names.
 * - This is the single place fonts are configured. To change a face,
 *   subset, or weight, edit only this block.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'WholesaleHub',
    template: '%s | WholesaleHub',
  },
  description: 'B2B marketplace for smoke shops and gas stations to buy from wholesale distributors',
  openGraph: {
    title: 'WholesaleHub',
    description: 'B2B marketplace for smoke shops and gas stations to buy from wholesale distributors. Compare prices, find the best deals, and streamline your purchasing.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-light font-sans">
        <Providers>
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
