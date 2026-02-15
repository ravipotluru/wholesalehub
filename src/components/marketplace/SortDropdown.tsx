'use client';

import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Allowed sort values */
type SortValue = 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'popular';

/** Props for the SortDropdown component */
interface SortDropdownProps {
  /** Currently selected sort value */
  value: SortValue;
  /** Callback when the sort value changes */
  onChange: (value: SortValue) => void;
}

/** Available sort options */
const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'price_asc', label: 'Price Low \u2192 High' },
  { value: 'price_desc', label: 'Price High \u2192 Low' },
  { value: 'rating', label: 'Rating Highest' },
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most Popular' },
];

/**
 * Styled sort dropdown selector for marketplace listings.
 * Defaults to "Price Low -> High".
 */
export function SortDropdown({ value, onChange }: SortDropdownProps) {
  return (
    <div className="relative inline-flex items-center gap-2">
      <ArrowUpDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortValue)}
        className={cn(
          'appearance-none bg-white border border-gray-300 rounded-lg',
          'pl-3 pr-8 py-2 text-sm text-dark cursor-pointer',
          'focus:ring-2 focus:ring-brand-teal focus:border-brand-teal',
          'transition-colors duration-200'
        )}
        aria-label="Sort products by"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {/* Custom chevron for the select */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg
          className="h-4 w-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );
}
