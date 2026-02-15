'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

/**
 * Props for the ReceivingProgress component.
 * Displays a visual progress bar for receipt receiving with stats.
 */
interface ReceivingProgressProps {
  /** Total number of lines in the receipt */
  totalLines: number;
  /** Number of lines that have been received */
  receivedLines: number;
  /** Number of discrepancies found during receiving */
  discrepancyCount: number;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * ReceivingProgress displays a visual progress bar showing receipt receiving status.
 * - Green when 100% complete
 * - Yellow when in progress
 * - Red accent if discrepancies exist
 */
export function ReceivingProgress({
  totalLines,
  receivedLines,
  discrepancyCount,
  className,
}: ReceivingProgressProps) {
  const percent = totalLines > 0 ? Math.round((receivedLines / totalLines) * 100) : 0;
  const isComplete = percent === 100;
  const hasDiscrepancies = discrepancyCount > 0;

  /** Determine bar fill color based on state */
  const barColor = isComplete
    ? 'bg-success'
    : hasDiscrepancies
      ? 'bg-status-warning'
      : 'bg-brand-teal';

  /** Determine bar track color */
  const trackColor = hasDiscrepancies ? 'bg-status-error/10' : 'bg-gray-200';

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress bar */}
      <div className="relative">
        <div className={cn('h-3 rounded-full overflow-hidden', trackColor)}>
          <div
            className={cn('h-full rounded-full transition-all duration-500 ease-out', barColor)}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold text-dark drop-shadow-sm">
            {percent}%
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          {isComplete ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <Clock className="h-4 w-4 text-brand-teal" />
          )}
          <span className={cn('font-medium', isComplete ? 'text-success' : 'text-dark')}>
            {receivedLines} of {totalLines} lines received
          </span>
        </div>

        {hasDiscrepancies && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-status-error" />
            <span className="font-medium text-status-error">
              {discrepancyCount} discrepanc{discrepancyCount === 1 ? 'y' : 'ies'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
