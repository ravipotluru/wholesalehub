'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-light flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <AlertTriangle className="h-16 w-16 text-status-error mx-auto mb-6" />

        <h1 className="text-2xl font-semibold text-dark mb-2">
          Something went wrong
        </h1>

        <p className="text-gray-500 mb-4">
          An unexpected error occurred. Please try again or return to the home page.
        </p>

        <div className="bg-gray-100 p-4 rounded-lg mb-6">
          <p className="text-sm font-mono text-gray-600 truncate">
            {error.message || 'An unknown error occurred'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-200 bg-brand-orange text-white hover:bg-brand-orange/90 px-6 py-3 text-sm w-full sm:w-auto"
          >
            Try Again
          </button>
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
