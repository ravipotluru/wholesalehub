'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { ProductDetailModal } from '@/components/marketplace/ProductDetailModal';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Select } from '@/components/ui/Select';
import { useUIStore } from '@/store/uiStore';
import { debounce } from '@/lib/utils';

const sortOptions = [
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'rating', label: 'Rating: Highest' },
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most Popular' },
];

const stockOptions = [
  { value: '', label: 'All Stock Status' },
  { value: 'IN_STOCK', label: 'In Stock' },
  { value: 'LOW_STOCK', label: 'Low Stock' },
  { value: 'OUT_OF_STOCK', label: 'Out of Stock' },
];

export default function MarketplacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { productModalId, openProductModal, closeProductModal } = useUIStore();

  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'price_asc');
  const [stockStatus, setStockStatus] = useState(searchParams.get('stockStatus') || '');
  const [page, setPage] = useState(Number(searchParams.get('page') || '1'));
  const [showFilters, setShowFilters] = useState(false);

  // Build query params
  const queryParams = new URLSearchParams();
  if (searchTerm) queryParams.set('q', searchTerm);
  if (category) queryParams.set('category', category);
  if (sort) queryParams.set('sort', sort);
  if (stockStatus) queryParams.set('stockStatus', stockStatus);
  queryParams.set('page', String(page));
  queryParams.set('limit', '24');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products', searchTerm, category, sort, stockStatus, page],
    queryFn: async () => {
      const res = await fetch(`/api/products?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
  });

  // Debounced search
  const debouncedSearch = debounce((value: string) => {
    setSearchTerm(value);
    setPage(1);
  }, 300);

  // Update URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('q', searchTerm);
    if (category) params.set('category', category);
    if (sort !== 'price_asc') params.set('sort', sort);
    if (stockStatus) params.set('stockStatus', stockStatus);
    if (page > 1) params.set('page', String(page));
    router.replace(`/marketplace?${params.toString()}`, { scroll: false });
  }, [searchTerm, category, sort, stockStatus, page, router]);

  const clearFilters = () => {
    setSearchTerm('');
    setCategory('');
    setSort('price_asc');
    setStockStatus('');
    setPage(1);
  };

  const hasActiveFilters = searchTerm || category || stockStatus || sort !== 'price_asc';

  return (
    <div>
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            defaultValue={searchTerm}
            onChange={(e) => debouncedSearch(e.target.value)}
            placeholder="Search products, brands, SKUs..."
            className="input-field pl-12 h-12 text-base"
          />
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(''); }}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">
            {data?.pagination?.total !== undefined
              ? searchTerm
                ? `${data.pagination.total} results for "${searchTerm}"`
                : `${data.pagination.total} products`
              : 'Loading...'}
          </p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-brand-teal hover:text-brand-teal-dark font-medium">
              Clear all filters
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="lg:hidden flex items-center gap-2 px-3 py-2 border rounded-lg text-sm"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
          <Select
            options={sortOptions}
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="w-48"
          />
        </div>
      </div>

      <div className="flex gap-6">
        {/* Category Sidebar */}
        <aside className={`w-64 flex-shrink-0 ${showFilters ? 'block' : 'hidden'} lg:block`}>
          <div className="card sticky top-20">
            <h3 className="font-semibold text-dark mb-4">Categories</h3>
            <div className="space-y-1">
              <button
                onClick={() => { setCategory(''); setPage(1); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  !category ? 'bg-brand-teal/10 text-brand-teal font-medium border-l-2 border-brand-teal' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                All Categories
              </button>
              {data?.categories?.map((cat: { id: string; name: string; count: number }) => (
                <button
                  key={cat.id}
                  onClick={() => { setCategory(cat.id); setPage(1); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between ${
                    category === cat.id ? 'bg-brand-teal/10 text-brand-teal font-medium border-l-2 border-brand-teal' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {cat.name}
                  <span className="text-xs text-gray-400">({cat.count})</span>
                </button>
              ))}
            </div>

            <hr className="my-4" />

            <h3 className="font-semibold text-dark mb-3">Stock Status</h3>
            <Select
              options={stockOptions}
              value={stockStatus}
              onChange={(e) => { setStockStatus(e.target.value); setPage(1); }}
            />
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          {error && (
            <ErrorBanner
              message="Failed to load products. Please try again."
              onRetry={() => refetch()}
            />
          )}

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!isLoading && !error && data?.products?.length === 0 && (
            <EmptyState
              icon="search"
              title="No products found"
              description={searchTerm ? `No results for "${searchTerm}". Try different keywords or clear filters.` : 'No products match your filters.'}
              actionLabel="Clear all filters"
              onAction={clearFilters}
            />
          )}

          {!isLoading && !error && data?.products?.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.products.map((product: Record<string, unknown>) => (
                  <ProductCard
                    key={product.id as string}
                    product={product}
                    onCompare={() => openProductModal(product.id as string)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {data.pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(5, data.pagination.totalPages) }).map((_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-4 py-2 border rounded-lg text-sm ${
                          page === pageNum ? 'bg-brand-blue text-white border-brand-blue' : 'hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(Math.min(data.pagination.totalPages, page + 1))}
                    disabled={page === data.pagination.totalPages}
                    className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Product Detail Modal */}
      {productModalId && (
        <ProductDetailModal
          productId={productModalId}
          onClose={closeProductModal}
        />
      )}
    </div>
  );
}
