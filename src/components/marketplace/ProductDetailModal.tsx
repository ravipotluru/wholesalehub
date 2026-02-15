'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { formatCurrency, getStockStatusColor } from '@/lib/utils';
import { ShoppingCart, Star, Truck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

interface ProductDetailModalProps {
  productId: string;
  onClose: () => void;
}

export function ProductDetailModal({ productId, onClose }: ProductDetailModalProps) {
  const queryClient = useQueryClient();
  const [addingToCart, setAddingToCart] = useState<string | null>(null);

  const { data: product, isLoading, error, refetch } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) throw new Error('Failed to fetch product');
      return res.json();
    },
  });

  const handleAddToCart = async (wholesalerId: string, price: number, moq: number) => {
    setAddingToCart(wholesalerId);
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          wholesalerId,
          quantity: moq,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to add to cart');
        return;
      }

      toast.success(`Added to cart at ${formatCurrency(price)}`);
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    } catch {
      toast.error('Failed to add to cart');
    } finally {
      setAddingToCart(null);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} size="full" title={isLoading ? 'Loading...' : product?.name}>
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="w-full h-64" variant="rectangular" />
          <Skeleton className="w-2/3 h-6" />
          <Skeleton className="w-full h-40" variant="rectangular" />
        </div>
      )}

      {error && <ErrorBanner message="Failed to load product details" onRetry={() => refetch()} />}

      {product && (
        <div>
          {/* Product Header */}
          <div className="flex gap-6 mb-8 flex-col md:flex-row">
            <div className="w-full md:w-80 h-80 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover rounded-lg" />
              ) : (
                <div className="text-gray-300 text-6xl font-bold">{product.name?.[0]}</div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge>{product.category?.name || 'Uncategorized'}</Badge>
                {product.ageRestricted && <Badge variant="warning">21+</Badge>}
              </div>
              <h2 className="text-2xl font-bold text-dark mb-1">{product.name}</h2>
              <p className="text-sm text-gray-500 mb-3">{product.brand} · SKU: {product.sku}</p>
              {product.description && (
                <p className="text-sm text-gray-600 mb-4">{product.description}</p>
              )}
              <div className="flex gap-4 text-sm text-gray-500">
                {product.unitOfMeasure && <span>Unit: {product.unitOfMeasure}</span>}
                {product.unitsPerCase && <span>Case: {product.unitsPerCase} units</span>}
                {product.weightLbs && <span>Weight: {Number(product.weightLbs)} lbs</span>}
              </div>
            </div>
          </div>

          {/* Supplier Comparison Table */}
          <h3 className="text-lg font-semibold text-dark mb-4">Supplier Comparison</h3>
          <div className="overflow-x-auto mb-8">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="table-header">Supplier</th>
                  <th className="table-header">Unit Price</th>
                  <th className="table-header">MOQ</th>
                  <th className="table-header">Stock</th>
                  <th className="table-header">Rating</th>
                  <th className="table-header">Shipping</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {product.suppliers?.map((supplier: Record<string, unknown>) => (
                  <tr
                    key={supplier.wholesalerId as string}
                    className={`border-b border-gray-100 ${
                      supplier.isBestPrice ? 'bg-success/5 border-l-4 border-l-success' : ''
                    } ${supplier.stockStatus === 'OUT_OF_STOCK' ? 'opacity-50' : ''}`}
                  >
                    <td className="table-cell">
                      <div>
                        <p className="font-medium text-dark">{supplier.wholesalerName as string}</p>
                        <p className="text-xs text-gray-500">{supplier.city as string}, {supplier.state as string}</p>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold font-mono text-dark">
                          {formatCurrency(supplier.wholesalePrice as number)}
                        </span>
                        {supplier.isBestPrice && <Badge variant="bestPrice">Best Price</Badge>}
                      </div>
                      {(supplier.savingsVsHighest as number) > 0 && supplier.isBestPrice && (
                        <p className="text-xs text-success mt-1">
                          Save {formatCurrency(supplier.savingsVsHighest as number)} vs highest
                        </p>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className="font-medium">{supplier.minimumOrderQty as number}</span>
                      <span className="text-gray-500 text-xs"> units</span>
                    </td>
                    <td className="table-cell">
                      <span className={getStockStatusColor(supplier.stockStatus as string)}>
                        {(supplier.stockStatus as string).replace('_', ' ')}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-400 fill-current" />
                        <span className="text-sm font-medium">{(supplier.ratingAvg as number)?.toFixed(1)}</span>
                        <span className="text-xs text-gray-400">({supplier.ratingCount as number})</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      {supplier.leadTimeDays ? (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Truck className="h-4 w-4" />
                          {supplier.leadTimeDays as number}d
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <Button
                        size="sm"
                        variant={supplier.isBestPrice ? 'primary' : 'outline'}
                        disabled={supplier.stockStatus === 'OUT_OF_STOCK'}
                        isLoading={addingToCart === (supplier.wholesalerId as string)}
                        onClick={() => handleAddToCart(
                          supplier.wholesalerId as string,
                          supplier.wholesalePrice as number,
                          supplier.minimumOrderQty as number
                        )}
                        leftIcon={<ShoppingCart className="h-4 w-4" />}
                      >
                        Add
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Age restriction warning */}
          {product.ageRestricted && (
            <div className="flex items-center gap-3 bg-status-warning/10 border border-status-warning/20 rounded-lg p-4">
              <AlertTriangle className="h-5 w-5 text-status-warning flex-shrink-0" />
              <p className="text-sm text-status-warning">
                This product is age-restricted. Buyer must be {product.minimumAge}+ years old.
                {product.restrictedStates?.length > 0 && (
                  <span> Restricted in: {(product.restrictedStates as string[]).join(', ')}.</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
