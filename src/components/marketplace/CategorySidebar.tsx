'use client';

import { useState, useCallback } from 'react';
import { Layers, ChevronRight, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Category node used by the sidebar tree */
interface CategoryNode {
  id: string;
  name: string;
  count: number;
  children?: CategoryNode[];
}

/** Props for the CategorySidebar component */
interface CategorySidebarProps {
  /** Hierarchical category tree data */
  categories: CategoryNode[];
  /** Currently selected category ID */
  selectedCategoryId?: string;
  /** Callback when a category is selected */
  onSelect: (categoryId: string | undefined) => void;
}

/**
 * Recursive tree item for a single category node.
 */
function CategoryTreeItem({
  category,
  selectedCategoryId,
  onSelect,
  depth = 0,
}: {
  category: CategoryNode;
  selectedCategoryId?: string;
  onSelect: (categoryId: string | undefined) => void;
  depth?: number;
}) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const hasChildren = category.children && category.children.length > 0;
  const isSelected = category.id === selectedCategoryId;

  const handleToggle = useCallback(() => {
    if (hasChildren) {
      setIsExpanded((prev) => !prev);
    }
  }, [hasChildren]);

  const handleSelect = useCallback(() => {
    onSelect(isSelected ? undefined : category.id);
  }, [onSelect, isSelected, category.id]);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer',
          'transition-colors duration-150',
          isSelected
            ? 'border-l-[3px] border-brand-teal bg-brand-teal/5 text-brand-teal font-medium'
            : 'hover:bg-gray-50 text-dark',
          depth > 0 && 'ml-4'
        )}
      >
        {/* Expand/collapse toggle for categories with children */}
        {hasChildren ? (
          <button
            type="button"
            onClick={handleToggle}
            className="flex-shrink-0 text-gray-400 hover:text-dark transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Category name + count */}
        <button
          type="button"
          onClick={handleSelect}
          className="flex-1 text-left text-sm truncate"
        >
          {category.name}
        </button>
        <span className="text-xs text-gray-400 flex-shrink-0">
          ({category.count})
        </span>
      </div>

      {/* Render children when expanded */}
      {hasChildren && isExpanded && (
        <div className="mt-0.5">
          {category.children?.map((child) => (
            <CategoryTreeItem
              key={child.id}
              category={child}
              selectedCategoryId={selectedCategoryId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Left sidebar for browsing product categories.
 * Sticky-positioned, 280px wide, with expandable sub-categories.
 */
export function CategorySidebar({
  categories,
  selectedCategoryId,
  onSelect,
}: CategorySidebarProps) {
  return (
    <aside className="w-[280px] sticky top-20 self-start">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-brand-blue" />
            <h2 className="text-base font-semibold text-dark">Categories</h2>
          </div>
        </div>

        {/* Clear filter link */}
        {selectedCategoryId && (
          <button
            type="button"
            onClick={() => onSelect(undefined)}
            className="flex items-center gap-1 text-sm text-brand-teal hover:text-brand-teal/80 mb-3 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear filter
          </button>
        )}

        {/* Category tree */}
        <nav className="space-y-0.5" aria-label="Product categories">
          {categories.map((category) => (
            <CategoryTreeItem
              key={category.id}
              category={category}
              selectedCategoryId={selectedCategoryId}
              onSelect={onSelect}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}
