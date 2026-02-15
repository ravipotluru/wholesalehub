'use client';

import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { CartItemRow } from '@/components/cart/CartItemRow';
import { Badge } from '@/components/ui/Badge';

/** Product data within a supplier-grouped cart item */
interface CartProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  sku: string;
}

/** Cart item within a supplier group */
interface SupplierCartItem {
  id: string;
  product: CartProduct;
  quantity: number;
  unitPrice: number;
  moqRequired: number;
  moqMet: boolean;
}

/** Supplier info for the group header */
interface SupplierInfo {
  name: string;
  city: string;
  state: string;
}

/** Props for the SupplierGroup component */
interface SupplierGroupProps {
  /** Supplier info shown in the group header */
  supplier: SupplierInfo;
  /** Items from this supplier in the cart */
  items: SupplierCartItem[];
  /** Callback when item quantity changes */
  onUpdateQty: (itemId: string, newQuantity: number) => void;
  /** Callback when an item is removed */
  onRemove: (itemId: string) => void;
}

/**
 * Groups cart items by supplier with a header showing
 * supplier name, location, and item count. Displays MOQ
 * status badges per item.
 */
export function SupplierGroup({
  supplier,
  items,
  onUpdateQty,
  onRemove,
}: SupplierGroupProps) {
  /** Calculate supplier subtotal */
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Supplier Header */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-dark">
            {supplier.name}
          </h3>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3.5 w-3.5" />
            {supplier.city}, {supplier.state}
          </div>
        </div>
        <Badge variant="default">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Cart Item Rows */}
      <div className="px-6">
        {items.map((item) => (
          <div key={item.id}>
            <CartItemRow
              item={{
                id: item.id,
                product: item.product,
                supplier,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              }}
              onUpdateQty={onUpdateQty}
              onRemove={onRemove}
            />
            {/* MOQ status badge */}
            <div className="pb-2 -mt-1">
              {item.moqMet ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                  <span>&#10003;</span> MOQ Met
                </span>
              ) : (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-medium',
                    'text-status-error bg-status-error/10 rounded-full px-2.5 py-0.5'
                  )}
                >
                  Need {item.moqRequired - item.quantity} more
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Supplier Subtotal */}
      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end">
        <span className="text-sm text-gray-500 mr-3">Supplier Subtotal:</span>
        <span className="text-base font-mono font-bold text-dark">
          {formatCurrency(subtotal)}
        </span>
      </div>
    </div>
  );
}
