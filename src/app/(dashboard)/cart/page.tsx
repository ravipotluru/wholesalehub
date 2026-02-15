'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Trash2, Minus, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

export default function CartPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      const res = await fetch('/api/cart');
      if (!res.ok) throw new Error('Failed to fetch cart');
      return res.json();
    },
  });

  const updateQuantity = async (itemId: string, productId: string, wholesalerId: string, quantity: number) => {
    if (quantity < 1) return;
    try {
      await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, wholesalerId, quantity }),
      });
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    } catch {
      toast.error('Failed to update quantity');
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await fetch(`/api/cart?id=${itemId}`, { method: 'DELETE' });
      toast.success('Item removed');
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    } catch {
      toast.error('Failed to remove item');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="w-48 h-8 mb-6" />
        {[1, 2].map((i) => (
          <Card key={i}><Skeleton className="w-full h-32" variant="rectangular" /></Card>
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message="Failed to load cart" onRetry={() => refetch()} />;
  }

  if (!data?.groups?.length) {
    return (
      <EmptyState
        icon="cart"
        title="Your cart is empty"
        description="Browse products and add items to your cart to get started."
        actionLabel="Browse Products"
        onAction={() => router.push('/marketplace')}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-dark mb-6">Shopping Cart</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {data.groups.map((group: Record<string, unknown>) => (
            <Card key={group.wholesalerId as string}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-dark">{group.wholesalerName as string}</h3>
                  <p className="text-xs text-gray-500">{group.city as string}, {group.state as string}</p>
                </div>
                {!(group.allMoqMet as boolean) && (
                  <Badge variant="warning">MOQ not met</Badge>
                )}
              </div>

              <div className="divide-y divide-gray-100">
                {(group.items as Record<string, unknown>[]).map((item) => (
                  <div key={item.id as string} className="py-3 flex items-center gap-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-400 text-xl font-bold">
                        {((item.product as Record<string, unknown>).name as string)?.[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark text-sm truncate">
                        {(item.product as Record<string, unknown>).name as string}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(item.unitPrice as number)} each
                      </p>
                      {!(item.moqMet as boolean) && (
                        <p className="text-xs text-status-error flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" />
                          Min. {item.moqRequired as number} units required
                        </p>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(
                          item.id as string,
                          item.productId as string,
                          item.wholesalerId as string,
                          (item.quantity as number) - 1
                        )}
                        className="w-8 h-8 rounded-lg border flex items-center justify-center hover:bg-gray-50"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-10 text-center font-medium text-sm">{item.quantity as number}</span>
                      <button
                        onClick={() => updateQuantity(
                          item.id as string,
                          item.productId as string,
                          item.wholesalerId as string,
                          (item.quantity as number) + 1
                        )}
                        className="w-8 h-8 rounded-lg border flex items-center justify-center hover:bg-gray-50"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Subtotal */}
                    <p className="font-semibold font-mono text-dark w-20 text-right">
                      {formatCurrency(item.subtotal as number)}
                    </p>

                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.id as string)}
                      className="p-2 text-gray-400 hover:text-status-error transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                <p className="text-sm text-gray-500">
                  Subtotal: <span className="font-semibold text-dark font-mono">{formatCurrency(group.subtotal as number)}</span>
                </p>
              </div>
            </Card>
          ))}
        </div>

        {/* Cart Summary */}
        <div>
          <Card className="sticky top-20">
            <h3 className="font-semibold text-dark mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-mono">{formatCurrency(data.summary.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Est. Shipping</span>
                <span className="text-success font-medium">Free</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Est. Tax</span>
                <span className="font-mono">{formatCurrency(data.summary.totalAmount * 0.0825)}</span>
              </div>
              <hr />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total</span>
                <span className="font-bold font-mono">{formatCurrency(data.summary.totalAmount * 1.0825)}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {!data.summary.allMoqMet && (
                <div className="bg-status-warning/10 border border-status-warning/20 rounded-lg p-3">
                  <p className="text-xs text-status-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Some items don&apos;t meet minimum order quantities
                  </p>
                </div>
              )}
              <Button
                variant="primary"
                className="w-full"
                disabled={!data.summary.allMoqMet}
                onClick={() => router.push('/checkout')}
                leftIcon={<ShoppingCart className="h-4 w-4" />}
              >
                Proceed to Checkout
              </Button>
              <p className="text-xs text-gray-400 text-center">
                {data.groups.length} supplier{data.groups.length !== 1 ? 's' : ''} · {data.summary.totalItems} item{data.summary.totalItems !== 1 ? 's' : ''}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
