'use client';

import { useCallback } from 'react';
import { Trash2, Minus, Plus } from 'lucide-react';
import { cn, formatCurrency, truncate } from '@/lib/utils';

/** Product data embedded in a cart item */
interface CartProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  sku: string;
}

/** Supplier data embedded in a cart item */
interface CartSupplier {
  name: string;
  city: string;
  state: string;
}

/** Cart item data required by CartItemRow */
interface CartItemData {
  id: string;
  product: CartProduct;
  supplier: CartSupplier;
  quantity: number;
  unitPrice: number;
}

/** Props for the CartItemRow component */
interface CartItemRowProps {
  /** The cart item to display */
  item: CartItemData;
  /** Callback when the quantity is updated */
  onUpdateQty: (itemId: string, newQuantity: number) => void;
  /** Callback when the item is removed */
  onRemove: (itemId: string) => void;
}

/**
 * Single cart line item row.
 * Displays product image, name, supplier, quantity controls,
 * unit price, and line subtotal.
 */
export function CartItemRow({ item, onUpdateQty, onRemove }: CartItemRowProps) {
  const lineTotal = item.quantity * item.unitPrice;

  const handleDecrement = useCallback(() => {
    if (item.quantity > 1) {
      onUpdateQty(item.id, item.quantity - 1);
    }
  }, [item.id, item.quantity, onUpdateQty]);

  const handleIncrement = useCallback(() => {
    onUpdateQty(item.id, item.quantity + 1);
  }, [item.id, item.quantity, onUpdateQty]);

  const handleRemove = useCallback(() => {
    onRemove(item.id);
  }, [item.id, onRemove]);

  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-100 last:border-b-0">
      {/* Product image */}
      <div className="w-[60px] h-[60px] flex-shrink-0 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
        {item.product.imageUrl ? (
          <img
            src={item.product.imageUrl}
            alt={item.product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-gray-300 text-lg font-bold">
            {item.product.name[0]}
          </span>
        )}
      </div>

      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-dark truncate">
          {truncate(item.product.name, 50)}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.supplier.name}
        </p>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-0">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={item.quantity <= 1}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-l-lg',
            'border-2 border-brand-blue text-brand-blue',
            'hover:bg-brand-blue hover:text-white transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-brand-blue'
          )}
          aria-label="Decrease quantity"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span
          className={cn(
            'w-10 h-8 flex items-center justify-center',
            'border-y-2 border-brand-blue text-sm font-medium text-dark'
          )}
        >
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={handleIncrement}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-r-lg',
            'border-2 border-brand-blue text-brand-blue',
            'hover:bg-brand-blue hover:text-white transition-colors'
          )}
          aria-label="Increase quantity"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Unit price */}
      <div className="w-24 text-right">
        <span className="text-sm font-mono text-gray-600">
          {formatCurrency(item.unitPrice)}
        </span>
      </div>

      {/* Line subtotal */}
      <div className="w-28 text-right">
        <span className="text-sm font-mono font-bold text-dark">
          {formatCurrency(lineTotal)}
        </span>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={handleRemove}
        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-status-error transition-colors"
        aria-label={`Remove ${item.product.name} from cart`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
