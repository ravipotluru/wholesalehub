'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorBannerProps {
  /** Optional bold heading. Renders above the message when provided. */
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({ title, message, onRetry, className }: ErrorBannerProps) {
  return (
    <div className={cn('bg-status-error/10 border border-status-error/20 rounded-lg p-4 flex items-start gap-3', className)}>
      <AlertCircle className="h-5 w-5 text-status-error flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold text-status-error">{title}</p>}
        <p className={cn('text-sm text-status-error', title && 'mt-0.5 opacity-90')}>{message}</p>
      </div>
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
