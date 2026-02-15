'use client';

import { AlertTriangle } from 'lucide-react';

/** Props for the MoqWarning component */
interface MoqWarningProps {
  /** Required minimum order quantity */
  required: number;
  /** Current quantity in the cart */
  current: number;
  /** Name of the product */
  productName: string;
  /** Optional callback to add more units */
  onAddMore?: () => void;
}

/**
 * MOQ warning banner.
 * Displays a yellow alert when a cart item does not meet
 * the minimum order quantity requirement.
 */
export function MoqWarning({
  required,
  current,
  productName,
  onAddMore,
}: MoqWarningProps) {
  const deficit = required - current;

  if (deficit <= 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg bg-status-warning/10 border border-status-warning/20 px-4 py-3">
      <AlertTriangle className="h-5 w-5 text-status-warning flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-dark">
          Minimum order of{' '}
          <span className="font-semibold">{required} units</span> required for{' '}
          <span className="font-medium">{productName}</span>. You have{' '}
          <span className="font-semibold">{current} units</span>.
        </p>
        {onAddMore && (
          <button
            type="button"
            onClick={onAddMore}
            className="mt-1 text-sm font-medium text-brand-teal hover:text-brand-teal/80 transition-colors"
          >
            Add {deficit} more &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
