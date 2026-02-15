'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

/** Current filter values managed by the FilterPanel */
interface FilterValues {
  minPrice?: number;
  maxPrice?: number;
  stockStatus: string[];
  minRating?: number;
}

/** Props for the FilterPanel component */
interface FilterPanelProps {
  /** Current filter state */
  filters: FilterValues;
  /** Callback when any filter value changes */
  onChange: (filters: FilterValues) => void;
  /** Callback to clear all filters */
  onClear: () => void;
}

/** Stock status options */
const STOCK_OPTIONS: { value: string; label: string }[] = [
  { value: 'IN_STOCK', label: 'In Stock' },
  { value: 'LOW_STOCK', label: 'Low Stock' },
  { value: 'OUT_OF_STOCK', label: 'Out of Stock' },
];

/** Rating filter options */
const RATING_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: 4, label: '4+ Stars' },
  { value: 3, label: '3+ Stars' },
  { value: 2, label: '2+ Stars' },
  { value: undefined, label: 'Any' },
];

/**
 * Marketplace filter sidebar panel.
 * Controls price range, stock status, and supplier rating filters.
 */
export function FilterPanel({ filters, onChange, onClear }: FilterPanelProps) {
  const [localMinPrice, setLocalMinPrice] = useState<string>(
    filters.minPrice !== undefined ? String(filters.minPrice) : ''
  );
  const [localMaxPrice, setLocalMaxPrice] = useState<string>(
    filters.maxPrice !== undefined ? String(filters.maxPrice) : ''
  );

  /** Apply the current price range inputs */
  const handleApplyPrice = useCallback(() => {
    const min = localMinPrice !== '' ? Number(localMinPrice) : undefined;
    const max = localMaxPrice !== '' ? Number(localMaxPrice) : undefined;
    onChange({
      ...filters,
      minPrice: min,
      maxPrice: max,
    });
  }, [localMinPrice, localMaxPrice, filters, onChange]);

  /** Toggle a stock status filter checkbox */
  const handleStockToggle = useCallback(
    (status: string) => {
      const current = filters.stockStatus;
      const updated = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      onChange({ ...filters, stockStatus: updated });
    },
    [filters, onChange]
  );

  /** Set the minimum supplier rating */
  const handleRatingChange = useCallback(
    (rating: number | undefined) => {
      onChange({ ...filters, minRating: rating });
    },
    [filters, onChange]
  );

  /** Check if any filter is actively applied */
  const hasActiveFilters =
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.stockStatus.length !== 1 ||
    !filters.stockStatus.includes('IN_STOCK') ||
    filters.minRating !== undefined;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-6">
      {/* Price Range */}
      <div>
        <h3 className="text-sm font-semibold text-dark mb-3">Price Range</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="Min"
              value={localMinPrice}
              onChange={(e) => setLocalMinPrice(e.target.value)}
              className={cn(
                'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm',
                'focus:ring-2 focus:ring-brand-teal focus:border-brand-teal',
                'placeholder:text-gray-400'
              )}
              aria-label="Minimum price"
            />
          </div>
          <span className="text-gray-400 text-sm">&ndash;</span>
          <div className="flex-1">
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="Max"
              value={localMaxPrice}
              onChange={(e) => setLocalMaxPrice(e.target.value)}
              className={cn(
                'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm',
                'focus:ring-2 focus:ring-brand-teal focus:border-brand-teal',
                'placeholder:text-gray-400'
              )}
              aria-label="Maximum price"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleApplyPrice}
          className={cn(
            'mt-2 w-full rounded-lg border-2 border-brand-blue text-brand-blue',
            'px-3 py-1.5 text-sm font-semibold',
            'hover:bg-brand-blue hover:text-white transition-colors duration-200'
          )}
        >
          Apply
        </button>
      </div>

      {/* Divider */}
      <hr className="border-gray-100" />

      {/* Stock Status */}
      <div>
        <h3 className="text-sm font-semibold text-dark mb-3">Stock Status</h3>
        <div className="space-y-2">
          {STOCK_OPTIONS.map((option) => {
            const isChecked = filters.stockStatus.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleStockToggle(option.value)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-teal focus:ring-brand-teal"
                />
                <span className="text-sm text-dark group-hover:text-brand-teal transition-colors">
                  {option.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <hr className="border-gray-100" />

      {/* Supplier Rating */}
      <div>
        <h3 className="text-sm font-semibold text-dark mb-3">
          Supplier Rating
        </h3>
        <div className="space-y-2">
          {RATING_OPTIONS.map((option) => {
            const isSelected = filters.minRating === option.value;
            return (
              <label
                key={option.label}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <input
                  type="radio"
                  name="supplierRating"
                  checked={isSelected}
                  onChange={() => handleRatingChange(option.value)}
                  className="h-4 w-4 border-gray-300 text-brand-teal focus:ring-brand-teal"
                />
                <span className="text-sm text-dark group-hover:text-brand-teal transition-colors">
                  {option.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Clear All */}
      {hasActiveFilters && (
        <>
          <hr className="border-gray-100" />
          <button
            type="button"
            onClick={onClear}
            className="w-full text-center text-sm font-medium text-brand-teal hover:text-brand-teal/80 transition-colors"
          >
            Clear All Filters
          </button>
        </>
      )}
    </div>
  );
}
