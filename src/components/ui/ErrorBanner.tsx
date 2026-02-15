'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({ message, onRetry, className }: ErrorBannerProps) {
  return (
    <div className={cn('bg-status-error/10 border border-status-error/20 rounded-lg p-4 flex items-center gap-3', className)}>
      <AlertCircle className="h-5 w-5 text-status-error flex-shrink-0" />
      <p className="text-sm text-status-error flex-1">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-sm font-medium text-status-error hover:text-red-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      )}
    </div>
  );
}
