'use client';

import { ShoppingBag } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

/** Props for the CartSummary component */
interface CartSummaryProps {
  /** Cart subtotal before shipping and tax */
  subtotal: number;
  /** Estimated shipping cost */
  shipping: number;
  /** Estimated tax */
  tax: number;
  /** Grand total */
  total: number;
  /** Total number of items in the cart */
  itemCount: number;
  /** Number of distinct suppliers */
  supplierCount: number;
  /** Whether all MOQ requirements are met */
  moqMet: boolean;
  /** Callback when the checkout button is clicked */
  onCheckout: () => void;
}

/**
 * Order summary card displayed as a sticky sidebar in the cart.
 * Shows subtotal, shipping, tax, total, and a checkout button
 * that is disabled when MOQ requirements are not met.
 */
export function CartSummary({
  subtotal,
  shipping,
  tax,
  total,
  itemCount,
  supplierCount,
  moqMet,
  onCheckout,
}: CartSummaryProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-20">
      <h2 className="text-lg font-semibold text-dark mb-4">Order Summary</h2>

      {/* Item / supplier summary */}
      <p className="text-sm text-gray-500 mb-4">
        {itemCount} item{itemCount !== 1 ? 's' : ''} from{' '}
        {supplierCount} supplier{supplierCount !== 1 ? 's' : ''}
      </p>

      {/* Line items */}
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-mono text-dark">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Estimated Shipping</span>
          <span className="font-mono text-dark">{formatCurrency(shipping)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Estimated Tax</span>
          <span className="font-mono text-dark">{formatCurrency(tax)}</span>
        </div>
      </div>

      {/* Divider */}
      <hr className="my-4 border-gray-200" />

      {/* Total */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-base font-semibold text-dark">Total</span>
        <span className="text-xl font-bold font-mono text-brand-blue">
          {formatCurrency(total)}
        </span>
      </div>

      {/* Checkout button */}
      <div className="relative group">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!moqMet || itemCount === 0}
          onClick={onCheckout}
          leftIcon={<ShoppingBag className="h-5 w-5" />}
        >
          Proceed to Checkout
        </Button>

        {/* MOQ tooltip when button is disabled */}
        {!moqMet && (
          <div
            className={cn(
              'absolute bottom-full left-1/2 -translate-x-1/2 mb-2',
              'bg-dark text-white text-xs rounded-lg px-3 py-2',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              'pointer-events-none whitespace-nowrap'
            )}
          >
            Some items do not meet minimum order quantities
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-dark" />
          </div>
        )}
      </div>
    </div>
  );
}
