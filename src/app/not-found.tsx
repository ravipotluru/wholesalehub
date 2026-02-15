import Link from 'next/link';
import { Package } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-light flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="relative inline-block mb-6">
          <Package className="h-20 w-20 text-brand-blue/30 mx-auto" />
          <span className="absolute -top-2 -right-2 text-3xl font-bold text-brand-orange">
            ?
          </span>
        </div>

        <h1 className="text-8xl font-bold text-brand-blue mb-4">404</h1>

        <h2 className="text-2xl font-semibold text-dark mb-2">
          Page Not Found
        </h2>

        <p className="text-gray-500 mb-8">
          The page you are looking for does not exist or has been moved.
          Please check the URL or navigate back to the marketplace.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-200 bg-brand-orange text-white hover:bg-brand-orange/90 px-6 py-3 text-sm w-full sm:w-auto"
          >
            Go to Marketplace
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-200 border-2 border-brand-blue text-brand-blue hover:bg-brand-blue hover:text-white px-6 py-3 text-sm w-full sm:w-auto"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
