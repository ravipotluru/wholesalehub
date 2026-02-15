'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Target, Edit3, Check } from 'lucide-react';

// ---------- Types ----------

/** Condition of a received item */
type ItemCondition = 'GOOD' | 'DAMAGED_MINOR' | 'DAMAGED_MAJOR' | 'WRONG_ITEM';

/** Status of a receipt line */
type LineStatus = 'PENDING' | 'RECEIVED' | 'PARTIAL' | 'SHORT' | 'OVER' | 'DAMAGED';

/** A single receipt line item */
export interface ReceiptLine {
  id: string;
  lineNumber: number;
  productId: string;
  productName: string;
  sku: string;
  expectedQty: number;
  receivedQty: number;
  condition: ItemCondition;
  status: LineStatus;
  notes: string;
  unitCost: number;
}

/** Partial update payload for a receipt line */
export interface LineUpdate {
  receivedQty?: number;
  condition?: ItemCondition;
  notes?: string;
}

/**
 * Props for the ReceiptLineTable component.
 * Renders a table of receipt line items with optional inline editing.
 */
interface ReceiptLineTableProps {
  /** Array of receipt line items to display */
  lines: ReceiptLine[];
  /** Whether inline editing is enabled */
  editable: boolean;
  /** Callback when a line is updated (receives line id + partial update) */
  onUpdateLine?: (lineId: string, update: LineUpdate) => void;
  /** Callback when the scan button is clicked on a line */
  onScanLine?: (lineId: string) => void;
  /** Optional additional CSS classes */
  className?: string;
}

/** Condition options for the dropdown */
const CONDITION_OPTIONS: { value: ItemCondition; label: string }[] = [
  { value: 'GOOD', label: 'Good' },
  { value: 'DAMAGED_MINOR', label: 'Minor Damage' },
  { value: 'DAMAGED_MAJOR', label: 'Major Damage' },
  { value: 'WRONG_ITEM', label: 'Wrong Item' },
];

/**
 * Returns the Badge variant for a given line status.
 */
function getStatusBadgeVariant(status: LineStatus): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'RECEIVED':
      return 'success';
    case 'PARTIAL':
      return 'warning';
    case 'SHORT':
    case 'DAMAGED':
      return 'error';
    case 'OVER':
      return 'info';
    case 'PENDING':
    default:
      return 'default';
  }
}

/**
 * Returns the row background color class based on line status.
 */
function getRowBgClass(status: LineStatus): string {
  switch (status) {
    case 'RECEIVED':
      return 'bg-success/5';
    case 'PARTIAL':
      return 'bg-status-warning/5';
    case 'SHORT':
    case 'DAMAGED':
      return 'bg-status-error/5';
    case 'OVER':
      return 'bg-status-info/5';
    case 'PENDING':
    default:
      return 'bg-gray-50/30';
  }
}

/**
 * ReceiptLineTable renders a fully-featured receipt line items table
 * with inline editing for received quantity, condition, and notes.
 */
export function ReceiptLineTable({
  lines,
  editable,
  onUpdateLine,
  onScanLine,
  className,
}: ReceiptLineTableProps) {
  /** Track which line is being inline-edited */
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<LineUpdate>({});

  const startEditing = useCallback((line: ReceiptLine) => {
    setEditingLineId(line.id);
    setEditValues({
      receivedQty: line.receivedQty,
      condition: line.condition,
      notes: line.notes,
    });
  }, []);

  const commitEdit = useCallback((lineId: string) => {
    if (onUpdateLine) {
      onUpdateLine(lineId, editValues);
    }
    setEditingLineId(null);
    setEditValues({});
  }, [editValues, onUpdateLine]);

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/50 border-b border-gray-100">
            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10">
              #
            </th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[200px]">
              Product
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">
              Expected
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
              Received
            </th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">
              Condition
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">
              Status
            </th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[140px]">
              Notes
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((line) => {
            const isEditing = editingLineId === line.id;
            return (
              <tr
                key={line.id}
                className={cn(
                  'transition-colors hover:bg-gray-50/80',
                  getRowBgClass(line.status),
                )}
              >
                {/* Line number */}
                <td className="px-3 py-3 text-sm text-gray-500 font-mono">
                  {line.lineNumber}
                </td>

                {/* Product name + SKU */}
                <td className="px-3 py-3">
                  <p className="text-sm font-medium text-dark">{line.productName}</p>
                  <p className="text-xs text-gray-400 font-mono">{line.sku}</p>
                </td>

                {/* Expected qty */}
                <td className="px-3 py-3 text-center">
                  <span className="text-sm font-semibold text-dark">{line.expectedQty}</span>
                </td>

                {/* Received qty (editable) */}
                <td className="px-3 py-3 text-center">
                  {editable && isEditing ? (
                    <input
                      type="number"
                      min={0}
                      value={editValues.receivedQty ?? 0}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          receivedQty: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      className="w-20 px-2 py-1 text-sm text-center border border-brand-teal rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
                    />
                  ) : (
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        line.receivedQty >= line.expectedQty
                          ? 'text-success'
                          : line.receivedQty > 0
                            ? 'text-status-warning'
                            : 'text-gray-400',
                      )}
                    >
                      {line.receivedQty}
                    </span>
                  )}
                </td>

                {/* Condition dropdown */}
                <td className="px-3 py-3">
                  {editable && isEditing ? (
                    <select
                      value={editValues.condition ?? line.condition}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          condition: e.target.value as ItemCondition,
                        }))
                      }
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
                    >
                      {CONDITION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={cn(
                        'text-xs font-medium',
                        line.condition === 'GOOD'
                          ? 'text-success'
                          : line.condition === 'DAMAGED_MINOR'
                            ? 'text-status-warning'
                            : 'text-status-error',
                      )}
                    >
                      {CONDITION_OPTIONS.find((o) => o.value === line.condition)?.label ?? line.condition}
                    </span>
                  )}
                </td>

                {/* Status badge */}
                <td className="px-3 py-3 text-center">
                  <Badge variant={getStatusBadgeVariant(line.status)}>
                    {line.status}
                  </Badge>
                </td>

                {/* Notes input */}
                <td className="px-3 py-3">
                  {editable && isEditing ? (
                    <input
                      type="text"
                      value={editValues.notes ?? ''}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      placeholder="Add note..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
                    />
                  ) : (
                    <span className="text-xs text-gray-500">
                      {line.notes || '\u2014'}
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {editable && isEditing ? (
                      <button
                        onClick={() => commitEdit(line.id)}
                        className="p-1.5 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors"
                        title="Save changes"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : editable ? (
                      <button
                        onClick={() => startEditing(line)}
                        className="p-1.5 rounded-md bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 transition-colors"
                        title="Edit line"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    ) : null}

                    {onScanLine && (
                      <button
                        onClick={() => onScanLine(line.id)}
                        className="p-1.5 rounded-md bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 transition-colors"
                        title="Scan barcode for this item"
                      >
                        <Target className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
