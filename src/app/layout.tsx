import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';
import { Providers } from './providers';

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
    <html lang="en">
      <body className="min-h-screen bg-light">
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
