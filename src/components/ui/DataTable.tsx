'use client';

import { type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableRowSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

interface Column {
  header: string;
  accessor: string;
  render?: (value: unknown, row: Record<string, unknown>) => ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps {
  columns: Column[];
  data: Record<string, unknown>[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: 'package' | 'search' | 'cart' | 'document';
  onRowClick?: (row: Record<string, unknown>) => void;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string) => void;
  className?: string;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function DataTable({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No data found',
  emptyIcon = 'package',
  onRowClick,
  sortColumn,
  sortDirection,
  onSort,
  className,
}: DataTableProps) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full">
        <thead>
          <tr className="sticky top-0 bg-white z-10 border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.accessor}
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider',
                  col.sortable && 'cursor-pointer select-none hover:text-dark'
                )}
                style={col.width ? { width: col.width } : undefined}
                onClick={() => {
                  if (col.sortable && onSort) {
                    onSort(col.accessor);
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    <span className="flex flex-col">
                      <ChevronUp
                        className={cn(
                          'h-3 w-3 -mb-1',
                          sortColumn === col.accessor && sortDirection === 'asc'
                            ? 'text-brand-blue'
                            : 'text-gray-300'
                        )}
                      />
                      <ChevronDown
                        className={cn(
                          'h-3 w-3',
                          sortColumn === col.accessor && sortDirection === 'desc'
                            ? 'text-brand-blue'
                            : 'text-gray-300'
                        )}
                      />
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRowSkeleton key={i} cols={columns.length} />
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  icon={emptyIcon}
                  title={emptyMessage}
                  className="py-12"
                />
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'hover:bg-light transition-colors duration-150',
                  onRowClick && 'cursor-pointer'
                )}
              >
                {columns.map((col) => {
                  const value = getNestedValue(row, col.accessor);
                  return (
                    <td
                      key={col.accessor}
                      className="px-4 py-4 text-sm text-dark"
                    >
                      {col.render ? col.render(value, row) : String(value ?? '')}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
