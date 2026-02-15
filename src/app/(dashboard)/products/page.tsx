'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package,
  Plus,
  Search,
  ChevronDown,
  Edit2,
  XCircle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  PackageX,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { KpiCard } from '@/components/ui/KpiCard';
import { TableRowSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency, getStockStatusColor, getStockStatusDot, debounce } from '@/lib/utils';
import { useMyProducts } from '@/hooks/useSupplierData';

// ── Mock data fallback ─────────────────────────────────────────────

interface MockProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  wholesalePrice: number;
  minimumOrderQty: number;
  stockStatus: string;
  stockQuantity: number;
  isActive: boolean;
  imageUrl: string | null;
}

const MOCK_PRODUCTS: MockProduct[] = [
  { id: '1', name: 'RAZ CA6000 Disposable Vape - Blue Razz', sku: 'RAZ-CA6K-BR', category: 'Disposable Vapes', brand: 'RAZ', wholesalePrice: 8.99, minimumOrderQty: 10, stockStatus: 'IN_STOCK', stockQuantity: 2500, isActive: true, imageUrl: null },
  { id: '2', name: 'Fume Infinity Disposable - Strawberry Banana', sku: 'FUME-INF-SB', category: 'Disposable Vapes', brand: 'Fume', wholesalePrice: 7.50, minimumOrderQty: 12, stockStatus: 'IN_STOCK', stockQuantity: 1800, isActive: true, imageUrl: null },
  { id: '3', name: 'ZYN Nicotine Pouches 6mg - Wintergreen', sku: 'ZYN-6MG-WG', category: 'Nicotine Pouches', brand: 'ZYN', wholesalePrice: 3.25, minimumOrderQty: 50, stockStatus: 'LOW_STOCK', stockQuantity: 150, isActive: true, imageUrl: null },
  { id: '4', name: 'BIC Classic Lighter - Assorted 50pk', sku: 'BIC-CL-50PK', category: 'Accessories', brand: 'BIC', wholesalePrice: 32.00, minimumOrderQty: 5, stockStatus: 'IN_STOCK', stockQuantity: 600, isActive: true, imageUrl: null },
  { id: '5', name: 'RAW Classic Rolling Papers King Size', sku: 'RAW-CL-KS', category: 'Rolling Papers', brand: 'RAW', wholesalePrice: 1.15, minimumOrderQty: 100, stockStatus: 'IN_STOCK', stockQuantity: 5000, isActive: true, imageUrl: null },
  { id: '6', name: 'Lost Mary OS5000 - Watermelon', sku: 'LM-OS5K-WM', category: 'Disposable Vapes', brand: 'Lost Mary', wholesalePrice: 9.25, minimumOrderQty: 10, stockStatus: 'OUT_OF_STOCK', stockQuantity: 0, isActive: true, imageUrl: null },
  { id: '7', name: 'Elf Bar BC5000 - Mango Peach', sku: 'ELF-BC5K-MP', category: 'Disposable Vapes', brand: 'Elf Bar', wholesalePrice: 8.75, minimumOrderQty: 10, stockStatus: 'IN_STOCK', stockQuantity: 3200, isActive: true, imageUrl: null },
  { id: '8', name: 'Clipper Lighter - Hemp Leaves 48ct', sku: 'CLIP-HEMP-48', category: 'Accessories', brand: 'Clipper', wholesalePrice: 45.60, minimumOrderQty: 3, stockStatus: 'LOW_STOCK', stockQuantity: 80, isActive: true, imageUrl: null },
  { id: '9', name: 'Backwoods Cigars - Honey Berry 8/5pk', sku: 'BW-HB-8PK', category: 'Cigars', brand: 'Backwoods', wholesalePrice: 42.00, minimumOrderQty: 5, stockStatus: 'IN_STOCK', stockQuantity: 400, isActive: false, imageUrl: null },
  { id: '10', name: 'Swisher Sweets Cigarillos - Grape 20/5pk', sku: 'SS-GR-20PK', category: 'Cigars', brand: 'Swisher', wholesalePrice: 28.50, minimumOrderQty: 10, stockStatus: 'IN_STOCK', stockQuantity: 900, isActive: true, imageUrl: null },
];

type SortKey = 'name' | 'price' | 'stock' | 'status';
type SortDir = 'asc' | 'desc';

function getStockLabel(status: string): string {
  switch (status) {
    case 'IN_STOCK': return 'In Stock';
    case 'LOW_STOCK': return 'Low Stock';
    case 'OUT_OF_STOCK': return 'Out of Stock';
    case 'BACKORDER': return 'Backorder';
    default: return status;
  }
}

export default function ProductsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const limit = 20;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetQuery = useCallback(
    debounce((val: string) => {
      setDebouncedQuery(val);
      setPage(1);
    }, 300),
    []
  );

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    debouncedSetQuery(val);
  };

  const { data, isLoading, error, refetch } = useMyProducts({
    q: debouncedQuery,
    sort: `${sortKey}_${sortDir}`,
    page,
    limit,
  });

  // Use API data or fallback to mock
  const products: MockProduct[] = data?.products ?? data?.data ?? MOCK_PRODUCTS;
  const totalProducts = data?.pagination?.total ?? products.length;

  // Filter by search for mock fallback
  const filtered = useMemo(() => {
    let items = products;
    if (debouncedQuery && !data?.products) {
      const q = debouncedQuery.toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }
    // Sort for mock fallback
    if (!data?.products) {
      items = [...items].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case 'name': cmp = a.name.localeCompare(b.name); break;
          case 'price': cmp = a.wholesalePrice - b.wholesalePrice; break;
          case 'stock': cmp = a.stockQuantity - b.stockQuantity; break;
          case 'status': cmp = a.stockStatus.localeCompare(b.stockStatus); break;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return items;
  }, [products, debouncedQuery, sortKey, sortDir, data?.products]);

  // Pagination for mock fallback
  const paginatedProducts = data?.products
    ? filtered
    : filtered.slice((page - 1) * limit, page * limit);
  const totalPages = data?.pagination?.totalPages ?? Math.ceil(filtered.length / limit);

  // KPI stats
  const stats = useMemo(() => {
    const all = data?.products ?? MOCK_PRODUCTS;
    return {
      total: totalProducts,
      active: all.filter((p: MockProduct) => p.isActive).length,
      lowStock: all.filter((p: MockProduct) => p.stockStatus === 'LOW_STOCK').length,
      outOfStock: all.filter((p: MockProduct) => p.stockStatus === 'OUT_OF_STOCK').length,
    };
  }, [data?.products, totalProducts]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleDeactivate = (productId: string) => {
    // Mock deactivation — in production would call API
    void productId;
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center">
            <Package className="h-5 w-5 text-brand-blue" />
          </div>
          <h1 className="text-2xl font-bold text-brand-blue">My Products</h1>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => router.push('/products/new')}
        >
          Add Product
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Products" value={stats.total} icon={Package} />
        <KpiCard title="Active" value={stats.active} icon={CheckCircle2} valueColor="text-success" />
        <KpiCard title="Low Stock" value={stats.lowStock} icon={AlertTriangle} valueColor="text-status-warning" />
        <KpiCard title="Out of Stock" value={stats.outOfStock} icon={PackageX} valueColor="text-status-error" />
      </div>

      {/* Search + Bulk Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search products by name, SKU, or category..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="input-field pl-10 w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            Update Prices
          </Button>
          <Button variant="outline" size="sm">
            Update Stock
          </Button>
        </div>
      </div>

      {/* Sort dropdown */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-500">Sort by:</span>
        {(['name', 'price', 'stock', 'status'] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => handleSort(key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === key
                ? 'bg-brand-blue text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
            {sortKey === key && (
              <ArrowUpDown className="h-3 w-3" />
            )}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <ErrorBanner
          message="Failed to load products. Using sample data."
          onRetry={() => refetch()}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">MOQ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={9} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && paginatedProducts.length === 0 && (
        <EmptyState
          icon="package"
          title="No products listed yet"
          description="Add your first product to start selling on WholesaleHub."
          actionLabel="Add your first product"
          onAction={() => router.push('/products/new')}
        />
      )}

      {/* Product table */}
      {!isLoading && paginatedProducts.length > 0 && (
        <>
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Wholesale Price
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      MOQ
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stock Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stock Qty
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginatedProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      {/* Product Image + Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover rounded-lg"
                              />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-gray-300" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-dark truncate max-w-[200px]">
                              {product.name}
                            </p>
                            <p className="text-xs text-gray-400">{product.brand}</p>
                          </div>
                        </div>
                      </td>

                      {/* SKU */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-mono text-gray-600">{product.sku}</p>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600">{product.category}</p>
                      </td>

                      {/* Wholesale Price */}
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-mono font-bold text-dark">
                          {formatCurrency(product.wholesalePrice)}
                        </p>
                      </td>

                      {/* MOQ */}
                      <td className="px-4 py-3 text-center">
                        <p className="text-sm text-gray-600">{product.minimumOrderQty}</p>
                      </td>

                      {/* Stock Status */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${getStockStatusDot(product.stockStatus)}`} />
                          <span className={`text-sm ${getStockStatusColor(product.stockStatus)}`}>
                            {getStockLabel(product.stockStatus)}
                          </span>
                        </div>
                      </td>

                      {/* Stock Qty */}
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-mono text-gray-600">
                          {product.stockQuantity.toLocaleString()}
                        </p>
                      </td>

                      {/* Active / Discontinued Badge */}
                      <td className="px-4 py-3 text-center">
                        <Badge variant={product.isActive ? 'success' : 'error'}>
                          {product.isActive ? 'ACTIVE' : 'DISCONTINUED'}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => router.push(`/products/${product.id}/edit`)}
                            className="p-1.5 hover:bg-brand-teal/10 rounded-lg transition-colors"
                            title="Edit product"
                          >
                            <Edit2 className="h-4 w-4 text-brand-teal" />
                          </button>
                          <button
                            onClick={() => handleDeactivate(product.id)}
                            className="p-1.5 hover:bg-status-error/10 rounded-lg transition-colors"
                            title={product.isActive ? 'Deactivate' : 'Activate'}
                          >
                            <XCircle className="h-4 w-4 text-status-error" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * limit + 1} to{' '}
                {Math.min(page * limit, filtered.length)} of {filtered.length} products
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 border rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-1.5 border rounded-lg text-sm ${
                        page === pageNum
                          ? 'bg-brand-blue text-white border-brand-blue'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-2 border rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
