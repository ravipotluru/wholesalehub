'use client';

import { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent } from 'react';
import { Search, X, Loader2, Clock, Tag, Box, Layers } from 'lucide-react';
import { cn, debounce } from '@/lib/utils';

/** Suggestion group types used to categorise search suggestions */
type SuggestionType = 'Products' | 'Brands' | 'Categories' | 'Recent';

/** A single search suggestion entry */
interface SearchSuggestion {
  id: string;
  text: string;
  type: SuggestionType;
}

/** Props for the SearchBar component */
interface SearchBarProps {
  /** Current search value */
  value: string;
  /** Callback when the search input value changes (debounced 300ms) */
  onChange: (value: string) => void;
  /** Callback when the user submits/selects a search */
  onSearch: (value: string) => void;
  /** Optional list of search suggestions to display */
  suggestions?: SearchSuggestion[];
  /** Whether suggestions are currently loading */
  isLoading?: boolean;
  /** Additional CSS class names */
  className?: string;
}

/** Icon mapping for each suggestion group type */
const SUGGESTION_TYPE_ICONS: Record<SuggestionType, typeof Search> = {
  Products: Box,
  Brands: Tag,
  Categories: Layers,
  Recent: Clock,
};

/** Maximum number of suggestion items shown */
const MAX_SUGGESTIONS = 8;

/**
 * Full-width marketplace search bar with debounced input,
 * suggestion dropdown, and keyboard navigation.
 */
export function SearchBar({
  value,
  onChange,
  onSearch,
  suggestions,
  isLoading = false,
  className,
}: SearchBarProps) {
  const [inputValue, setInputValue] = useState<string>(value);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /** Sync internal value when controlled value changes externally */
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  /** Create debounced change handler */
  const debouncedOnChange = useMemo(
    () => debounce((v: string) => onChange(v), 300),
    [onChange]
  );

  /** Handle input change: update local state immediately, debounce parent */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      setIsOpen(newValue.length > 0);
      setActiveIndex(-1);
      debouncedOnChange(newValue);
    },
    [debouncedOnChange]
  );

  /** Clear the search input */
  const handleClear = useCallback(() => {
    setInputValue('');
    setIsOpen(false);
    setActiveIndex(-1);
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  /** Select a suggestion or submit the current input */
  const handleSelect = useCallback(
    (text: string) => {
      setInputValue(text);
      setIsOpen(false);
      setActiveIndex(-1);
      onSearch(text);
    },
    [onSearch]
  );

  /** Build grouped + sliced suggestion list */
  const flatSuggestions = useMemo(() => {
    if (!suggestions) return [];
    return suggestions.slice(0, MAX_SUGGESTIONS);
  }, [suggestions]);

  /** Group suggestions by type for rendering */
  const groupedSuggestions = useMemo(() => {
    const groups = new Map<SuggestionType, SearchSuggestion[]>();
    for (const suggestion of flatSuggestions) {
      const existing = groups.get(suggestion.type) ?? [];
      existing.push(suggestion);
      groups.set(suggestion.type, existing);
    }
    return groups;
  }, [flatSuggestions]);

  /** Keyboard navigation for the suggestion dropdown */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || flatSuggestions.length === 0) {
        if (e.key === 'Enter') {
          onSearch(inputValue);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < flatSuggestions.length - 1 ? prev + 1 : 0
          );
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : flatSuggestions.length - 1
          );
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < flatSuggestions.length) {
            handleSelect(flatSuggestions[activeIndex].text);
          } else {
            onSearch(inputValue);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setIsOpen(false);
          setActiveIndex(-1);
          break;
        }
      }
    },
    [isOpen, flatSuggestions, activeIndex, inputValue, onSearch, handleSelect]
  );

  /** Close dropdown when clicking outside */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /** Track the flat index across groups for keyboard highlight */
  let flatIndex = -1;

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {/* Search Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-4 h-5 w-5 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.length > 0) setIsOpen(true);
          }}
          placeholder="Search products, brands, SKUs..."
          className={cn(
            'w-full h-12 pl-12 pr-12 rounded-lg border border-gray-300',
            'text-dark placeholder:text-gray-400',
            'focus:ring-2 focus:ring-brand-teal focus:border-brand-teal',
            'transition-colors duration-200'
          )}
          aria-label="Search products"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          role="combobox"
          aria-autocomplete="list"
        />

        {/* Loading spinner or clear button */}
        <div className="absolute right-4 flex items-center">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
          ) : inputValue.length > 0 ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-dark transition-colors"
              aria-label="Clear search"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && flatSuggestions.length > 0 && (
        <div
          className={cn(
            'absolute top-full left-0 right-0 z-50 mt-1',
            'bg-white rounded-lg border border-gray-200 shadow-lg',
            'max-h-[400px] overflow-y-auto'
          )}
          role="listbox"
        >
          {Array.from(groupedSuggestions.entries()).map(([type, items]) => {
            const TypeIcon = SUGGESTION_TYPE_ICONS[type];
            return (
              <div key={type}>
                {/* Group header */}
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 flex items-center gap-2">
                  <TypeIcon className="h-3.5 w-3.5" />
                  {type}
                </div>
                {/* Suggestion items */}
                {items.map((item) => {
                  flatIndex++;
                  const currentIndex = flatIndex;
                  const isActive = currentIndex === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={cn(
                        'w-full px-4 py-2.5 text-left text-sm text-dark',
                        'hover:bg-brand-teal/5 transition-colors',
                        isActive && 'bg-brand-teal/10 text-brand-teal'
                      )}
                      onMouseEnter={() => setActiveIndex(currentIndex)}
                      onClick={() => handleSelect(item.text)}
                    >
                      {item.text}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
