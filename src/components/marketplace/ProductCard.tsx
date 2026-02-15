'use client';

import { ShoppingCart, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency, getStockStatusDot, truncate } from '@/lib/utils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface ProductCardProps {
  product: Record<string, unknown>;
  onCompare: () => void;
}

export function ProductCard({ product, onCompare }: ProductCardProps) {
  const queryClient = useQueryClient();
  const lowestPrice = product.lowestPrice as number;
  const highestPrice = product.highestPrice as number;
  const supplierCount = product.supplierCount as number;
  const bestSupplier = product.bestSupplier as Record<string, unknown> | null;
  const stockStatus = product.stockStatus as string;

  const handleAddToCart = async () => {
    if (!bestSupplier) return;

    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          wholesalerId: bestSupplier.wholesalerId,
          quantity: 1,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to add to cart');
        return;
      }

      const data = await res.json();
      toast.success(data.message);
      if (data.moqWarning) {
        toast.warning(data.moqWarning);
      }
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    } catch {
      toast.error('Failed to add to cart');
    }
  };

  return (
    <div className="card hover:shadow-md transition-shadow cursor-pointer group">
      {/* Image placeholder */}
      <div className="w-full h-48 bg-gray-100 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl as string}
            alt={product.name as string}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-gray-300 text-4xl font-bold">
            {(product.name as string)?.[0]}
          </div>
        )}
      </div>

      {/* Category badge */}
      <Badge variant="default" className="mb-2">
        {product.category as string}
      </Badge>

      {/* Product name */}
      <h3
        className="font-semibold text-dark mb-1 line-clamp-2 group-hover:text-brand-teal transition-colors"
        onClick={onCompare}
      >
        {truncate(product.name as string, 60)}
      </h3>

      {/* Brand */}
      <p className="text-sm text-gray-500 mb-3">{product.brand as string}</p>

      {/* Price range */}
      <div className="flex items-center justify-between mb-2">
        <div>
          {lowestPrice === highestPrice ? (
            <span className="text-lg font-bold font-mono text-success">
              {formatCurrency(lowestPrice)}
            </span>
          ) : (
            <span className="text-lg font-bold font-mono">
              <span className="text-success">{formatCurrency(lowestPrice)}</span>
              <span className="text-gray-400 text-sm"> - {formatCurrency(highestPrice)}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${getStockStatusDot(stockStatus)}`} />
          <span className="text-xs text-gray-500">
            {stockStatus.replace('_', ' ').toLowerCase()}
          </span>
        </div>
      </div>

      {/* Supplier count */}
      <p className="text-xs text-gray-500 mb-4">from {supplierCount} supplier{supplierCount !== 1 ? 's' : ''}</p>

      {/* Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCompare}
          leftIcon={<BarChart3 className="h-4 w-4" />}
        >
          Compare
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          onClick={handleAddToCart}
          disabled={stockStatus === 'OUT_OF_STOCK' || !bestSupplier}
          leftIcon={<ShoppingCart className="h-4 w-4" />}
        >
          Add to Cart
        </Button>
      </div>

      {/* Best price banner */}
      {bestSupplier && supplierCount > 1 && (
        <div className="mt-3 -mx-6 -mb-6 px-4 py-2 bg-success/10 rounded-b-xl border-t border-success/20">
          <p className="text-xs font-medium text-success">
            BEST PRICE: {formatCurrency(bestSupplier.price as number)} at {bestSupplier.name as string}
          </p>
        </div>
      )}
    </div>
  );
}
