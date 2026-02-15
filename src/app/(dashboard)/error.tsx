'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center py-16 px-4">
      <Card className="max-w-md w-full text-center" padding="lg">
        <AlertTriangle className="h-14 w-14 text-status-error mx-auto mb-4" />

        <h2 className="text-xl font-semibold text-dark mb-2">
          Something went wrong
        </h2>

        <p className="text-gray-500 text-sm mb-4">
          An error occurred while loading this section. Please try again.
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
            Retry
          </button>
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-200 border-2 border-brand-blue text-brand-blue hover:bg-brand-blue hover:text-white px-6 py-3 text-sm w-full sm:w-auto"
          >
            Go to Marketplace
          </Link>
        </div>
      </Card>
    </div>
  );
}
