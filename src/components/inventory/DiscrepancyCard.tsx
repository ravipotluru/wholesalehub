'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  PackageX,
  ShieldAlert,
  Camera,
  CheckCircle2,
} from 'lucide-react';

// ---------- Types ----------

/** Type of discrepancy detected during receiving */
export type DiscrepancyType = 'SHORT' | 'OVER' | 'DAMAGED' | 'WRONG_ITEM';

/** Resolution strategy for a discrepancy */
export type ResolutionType = 'ACCEPT_AS_IS' | 'RETURN' | 'CREDIT_REQUEST' | 'DESTROY';

/** Severity level of a discrepancy */
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** A discrepancy record for a receipt line */
export interface Discrepancy {
  id: string;
  type: DiscrepancyType;
  productName: string;
  sku: string;
  expectedQty: number;
  receivedQty: number;
  variance: number;
  severity: SeverityLevel;
  resolution: ResolutionType | null;
  notes: string;
  photoUrl: string | null;
  resolvedAt: string | null;
}

/**
 * Props for the DiscrepancyCard component.
 * Displays a single discrepancy with visual indicators and resolution controls.
 */
interface DiscrepancyCardProps {
  /** The discrepancy data to display */
  discrepancy: Discrepancy;
  /** Callback when the discrepancy is resolved */
  onResolve?: (id: string, resolution: ResolutionType, notes: string) => void;
  /** Optional additional CSS classes */
  className?: string;
}

/** Resolution options for the dropdown */
const RESOLUTION_OPTIONS: { value: ResolutionType; label: string }[] = [
  { value: 'ACCEPT_AS_IS', label: 'Accept As-Is' },
  { value: 'RETURN', label: 'Return to Supplier' },
  { value: 'CREDIT_REQUEST', label: 'Request Credit' },
  { value: 'DESTROY', label: 'Destroy / Discard' },
];

/**
 * Returns the icon component for a discrepancy type.
 */
function getTypeIcon(type: DiscrepancyType) {
  switch (type) {
    case 'SHORT':
      return ArrowDown;
    case 'OVER':
      return ArrowUp;
    case 'DAMAGED':
      return AlertTriangle;
    case 'WRONG_ITEM':
      return PackageX;
  }
}

/**
 * Returns badge variant for discrepancy type.
 */
function getTypeBadgeVariant(type: DiscrepancyType): 'error' | 'warning' | 'info' {
  switch (type) {
    case 'SHORT':
    case 'DAMAGED':
      return 'error';
    case 'WRONG_ITEM':
      return 'warning';
    case 'OVER':
      return 'info';
  }
}

/**
 * Returns badge variant for severity level.
 */
function getSeverityBadgeVariant(severity: SeverityLevel): 'default' | 'success' | 'warning' | 'error' {
  switch (severity) {
    case 'LOW':
      return 'default';
    case 'MEDIUM':
      return 'warning';
    case 'HIGH':
    case 'CRITICAL':
      return 'error';
  }
}

/**
 * DiscrepancyCard displays a single discrepancy found during inventory receiving.
 * Shows type icon, product info, expected vs received with visual variance bar,
 * severity indicator, and resolution controls.
 */
export function DiscrepancyCard({
  discrepancy,
  onResolve,
  className,
}: DiscrepancyCardProps) {
  const [selectedResolution, setSelectedResolution] = useState<ResolutionType>(
    discrepancy.resolution ?? 'ACCEPT_AS_IS',
  );
  const [resolutionNotes, setResolutionNotes] = useState(discrepancy.notes);
  const isResolved = discrepancy.resolvedAt !== null;

  const TypeIcon = getTypeIcon(discrepancy.type);

  /** Percentage bar for expected vs received */
  const maxQty = Math.max(discrepancy.expectedQty, discrepancy.receivedQty, 1);
  const expectedWidth = (discrepancy.expectedQty / maxQty) * 100;
  const receivedWidth = (discrepancy.receivedQty / maxQty) * 100;

  return (
    <div
      className={cn(
        'bg-white rounded-xl border shadow-sm p-4',
        isResolved ? 'border-gray-200 opacity-75' : 'border-status-error/30',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            discrepancy.type === 'SHORT' || discrepancy.type === 'DAMAGED'
              ? 'bg-status-error/10'
              : discrepancy.type === 'WRONG_ITEM'
                ? 'bg-status-warning/10'
                : 'bg-status-info/10',
          )}
        >
          <TypeIcon
            className={cn(
              'h-5 w-5',
              discrepancy.type === 'SHORT' || discrepancy.type === 'DAMAGED'
                ? 'text-status-error'
                : discrepancy.type === 'WRONG_ITEM'
                  ? 'text-status-warning'
                  : 'text-status-info',
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge variant={getTypeBadgeVariant(discrepancy.type)}>
              {discrepancy.type.replace('_', ' ')}
            </Badge>
            <Badge variant={getSeverityBadgeVariant(discrepancy.severity)}>
              {discrepancy.severity}
            </Badge>
            {isResolved && (
              <Badge variant="success">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Resolved
              </Badge>
            )}
          </div>

          {/* Product info */}
          <p className="text-sm font-medium text-dark">{discrepancy.productName}</p>
          <p className="text-xs text-gray-400 font-mono mb-3">{discrepancy.sku}</p>

          {/* Expected vs Received visual bar */}
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16">Expected</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-blue rounded-full"
                  style={{ width: `${expectedWidth}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-dark w-8 text-right">
                {discrepancy.expectedQty}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16">Received</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full',
                    discrepancy.receivedQty >= discrepancy.expectedQty
                      ? 'bg-success'
                      : 'bg-status-error',
                  )}
                  style={{ width: `${receivedWidth}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-dark w-8 text-right">
                {discrepancy.receivedQty}
              </span>
            </div>
          </div>

          {/* Variance */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">Variance:</span>
            <span
              className={cn(
                'text-sm font-bold',
                discrepancy.variance < 0 ? 'text-status-error' : 'text-status-info',
              )}
            >
              {discrepancy.variance > 0 ? '+' : ''}{discrepancy.variance}
            </span>
          </div>

          {/* Photo upload placeholder */}
          {!isResolved && (
            <button
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-brand-teal transition-colors mb-3"
              title="Attach photo evidence"
            >
              <Camera className="h-3.5 w-3.5" />
              {discrepancy.photoUrl ? 'Photo attached' : 'Attach photo'}
            </button>
          )}

          {/* Resolution controls */}
          {!isResolved && onResolve && (
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <select
                value={selectedResolution}
                onChange={(e) => setSelectedResolution(e.target.value as ResolutionType)}
                className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
              >
                {RESOLUTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Notes..."
                className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onResolve(discrepancy.id, selectedResolution, resolutionNotes)}
                className="text-xs px-3 py-1.5"
              >
                Resolve
              </Button>
            </div>
          )}

          {/* Resolved info */}
          {isResolved && discrepancy.resolution && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Resolved: <span className="font-medium text-dark">
                  {RESOLUTION_OPTIONS.find((o) => o.value === discrepancy.resolution)?.label}
                </span>
              </p>
              {discrepancy.notes && (
                <p className="text-xs text-gray-400 mt-0.5">{discrepancy.notes}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
