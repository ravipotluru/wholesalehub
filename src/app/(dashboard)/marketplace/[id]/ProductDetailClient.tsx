'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Minus,
  Plus,
  ShieldAlert,
  ShoppingCart,
  Star,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn, formatCurrency } from '@/lib/utils';

type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'BACKORDER';

interface Tier {
  id: string;
  minQty: number;
  unitPrice: string; // serialized Decimal, e.g. "11.75"
}

interface Supplier {
  pricingId: string;
  wholesalerId: string; // Wholesaler cuid — what POST /api/cart expects
  wholesalerName: string;
  ratingAvg: string | null; // e.g. "4.5"
  unitPrice: string; // base wholesale price, serialized Decimal
  minimumOrderQty: number;
  caseQty: number | null;
  stockStatus: StockStatus;
  leadTimeDays: number | null;
  tiers: Tier[]; // minQty ascending
}

interface ProductInfo {
  id: string; // Product cuid — what POST /api/cart expects
  name: string;
  sku: string;
  upcCode: string | null;
  brand: string | null;
  description: string | null;
  ageRestricted: boolean;
  minimumAge: number;
  imageUrl: string | null;
  unitsPerCase: number | null;
  categoryName: string | null;
}

type VerificationStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';

interface ProductDetailClientProps {
  product: ProductInfo;
  /** Sorted ascending by unit price on the server — index 0 is BEST PRICE. */
  suppliers: Supplier[];
  /** Only set for RETAILER users; null for other roles. */
  verificationStatus: VerificationStatus | null;
}

const stockBadgeVariant: Record<StockStatus, 'success' | 'warning' | 'error' | 'info'> = {
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'error',
  BACKORDER: 'info',
};

function stockLabel(status: StockStatus): string {
  return status.replace(/_/g, ' ');
}

/**
 * Effective unit price for a quantity: cheapest of the base price and any
 * tier whose minQty is met. Display-only math — checkout re-prices
 * server-side with Decimals (see selectUnitPrice).
 */
function effectiveUnitPrice(
  supplier: Supplier,
  qty: number
): { price: string; tierApplied: boolean } {
  let price = supplier.unitPrice;
  let tierApplied = false;
  for (const tier of supplier.tiers) {
    if (tier.minQty <= qty && parseFloat(tier.unitPrice) < parseFloat(price)) {
      price = tier.unitPrice;
      tierApplied = true;
    }
  }
  return { price, tierApplied };
}

interface LadderRow {
  from: number;
  to: number | null; // null = open-ended ("N+")
  label: string;
  unitPrice: string;
}

/** Qty-range rows derived from consecutive tier minQty breaks, starting at MOQ. */
function buildLadder(supplier: Supplier): LadderRow[] {
  const moq = supplier.minimumOrderQty;
  const breaks = Array.from(
    new Set([moq, ...supplier.tiers.map((t) => t.minQty).filter((m) => m > moq)])
  ).sort((a, b) => a - b);

  return breaks.map((from, i) => {
    const to = i < breaks.length - 1 ? breaks[i + 1] - 1 : null;
    return {
      from,
      to,
      label: to === null ? `${from}+` : `${from}–${to}`,
      unitPrice: effectiveUnitPrice(supplier, from).price,
    };
  });
}

export function ProductDetailClient({
  product,
  suppliers,
  verificationStatus,
}: ProductDetailClientProps) {
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(
    () => suppliers[0]?.pricingId ?? null
  );
  const [qtyInput, setQtyInput] = useState<string>(() =>
    String(suppliers[0]?.minimumOrderQty ?? 1)
  );
  const [isAdding, setIsAdding] = useState(false);

  const selected = useMemo(
    () => suppliers.find((s) => s.pricingId === selectedId) ?? null,
    [suppliers, selectedId]
  );

  const moq = selected?.minimumOrderQty ?? 1;
  const parsedQty = parseInt(qtyInput, 10);
  const quantity = Number.isNaN(parsedQty) ? moq : Math.max(parsedQty, moq);

  const ladder = useMemo(() => (selected ? buildLadder(selected) : []), [selected]);
  const effective = selected
    ? effectiveUnitPrice(selected, quantity)
    : { price: '0.00', tierApplied: false };

  const currentRowIndex = ladder.findIndex(
    (row) => quantity >= row.from && (row.to === null || quantity <= row.to)
  );
  const nextRow =
    currentRowIndex >= 0 && currentRowIndex < ladder.length - 1
      ? ladder[currentRowIndex + 1]
      : null;
  const nudge =
    nextRow && parseFloat(nextRow.unitPrice) < parseFloat(effective.price)
      ? { delta: nextRow.from - quantity, unitPrice: nextRow.unitPrice }
      : null;

  const verificationGate = product.ageRestricted && verificationStatus !== 'VERIFIED';

  const initials = (product.brand ?? product.name)
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  const selectSupplier = (supplier: Supplier) => {
    setSelectedId(supplier.pricingId);
    const parsed = parseInt(qtyInput, 10);
    if (Number.isNaN(parsed) || parsed < supplier.minimumOrderQty) {
      setQtyInput(String(supplier.minimumOrderQty));
    }
  };

  const handleAddToCart = async () => {
    if (!selected) return;
    setIsAdding(true);
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          wholesalerId: selected.wholesalerId,
          quantity,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to add to cart');
        return;
      }

      toast.success(data?.message ?? `${product.name} added to cart`);
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    } catch {
      toast.error('Failed to add to cart');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Back link */}
      <Link
        href="/marketplace"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-brand-teal"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to marketplace
      </Link>

      {/* Hero: image left, product info right (stacked on mobile) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <div>
          <Card padding="none" className="overflow-hidden">
            <div className="flex aspect-square w-full items-center justify-center bg-gray-100">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-7xl font-bold text-gray-300">{initials}</span>
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <div>
            {product.brand && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                {product.brand}
              </p>
            )}
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-dark sm:text-3xl">
              {product.name}
            </h1>
            <p className="mt-1.5 font-mono text-xs text-gray-500">
              SKU {product.sku}
              {product.upcCode && <span> · UPC {product.upcCode}</span>}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {product.categoryName && <Badge>{product.categoryName}</Badge>}
              {product.ageRestricted && (
                <Badge variant="warning">{product.minimumAge}+</Badge>
              )}
              {product.unitsPerCase && (
                <span className="text-xs text-gray-500">
                  Case pack: {product.unitsPerCase} units
                </span>
              )}
            </div>
            {product.description && (
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                {product.description}
              </p>
            )}
          </div>

          {/* Age-restriction banner */}
          {product.ageRestricted && (
            <div className="flex items-start gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 p-4">
              <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-status-warning" />
              <div className="text-sm">
                <p className="font-semibold text-dark">
                  Age-restricted product ({product.minimumAge}+)
                </p>
                <p className="mt-0.5 text-gray-600">
                  {verificationGate
                    ? 'Your business must be verified before you can purchase this item.'
                    : 'Sold only to verified businesses. Age verification applies at delivery.'}
                </p>
              </div>
            </div>
          )}

          {suppliers.length === 0 || !selected ? (
            <EmptyState
              icon="package"
              title="No suppliers currently list this product"
              description="Check back soon — supplier listings update daily."
            />
          ) : (
            <>
              {/* Supplier comparison */}
              <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Compare suppliers
                </h2>
                <div className="flex flex-col gap-2" role="radiogroup" aria-label="Select supplier">
                  {suppliers.map((supplier, index) => {
                    const isSelected = supplier.pricingId === selected.pricingId;
                    return (
                      <label
                        key={supplier.pricingId}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                          isSelected
                            ? 'border-brand-teal bg-brand-teal/5'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        )}
                      >
                        <input
                          type="radio"
                          name="supplier"
                          className="h-4 w-4 flex-shrink-0 accent-brand-teal"
                          checked={isSelected}
                          onChange={() => selectSupplier(supplier)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-dark">
                              {supplier.wholesalerName}
                            </span>
                            {index === 0 && (
                              <Badge variant="bestPrice">Best price</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <Star className="h-3.5 w-3.5 fill-current text-yellow-400" />
                              {supplier.ratingAvg ?? 'No rating'}
                            </span>
                            <Badge variant={stockBadgeVariant[supplier.stockStatus]}>
                              {stockLabel(supplier.stockStatus)}
                            </Badge>
                            <span className="inline-flex items-center gap-1">
                              <Truck className="h-3.5 w-3.5" />
                              {supplier.leadTimeDays != null
                                ? `${supplier.leadTimeDays}d lead time`
                                : 'Lead time varies'}
                            </span>
                            <span>MOQ {supplier.minimumOrderQty}</span>
                          </div>
                        </div>
                        <span className="font-mono text-base font-bold text-dark">
                          {formatCurrency(supplier.unitPrice)}
                          <span className="text-xs font-normal text-gray-400">/unit</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Tier ladder for the selected supplier */}
              <Card padding="sm">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Volume pricing — {selected.wholesalerName}
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="py-2 pr-4 font-semibold">Quantity</th>
                      <th className="py-2 pr-4 font-semibold">Price / unit</th>
                      <th className="py-2" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {ladder.map((row, index) => {
                      const isCurrent = index === currentRowIndex;
                      return (
                        <tr
                          key={row.from}
                          className={cn(
                            'border-b border-gray-50 last:border-0',
                            isCurrent && 'bg-brand-teal/10'
                          )}
                        >
                          <td className="py-2 pr-4 font-medium text-dark">{row.label}</td>
                          <td className="py-2 pr-4 font-mono text-dark">
                            {formatCurrency(row.unitPrice)}
                          </td>
                          <td className="py-2 text-right text-xs font-semibold text-brand-teal">
                            {isCurrent ? '← you' : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {nudge && (
                  <div className="mt-3 rounded-lg border border-brand-teal/30 bg-brand-teal/5 p-3 text-sm text-brand-teal-dark">
                    Add <strong>{nudge.delta}</strong> more unit
                    {nudge.delta === 1 ? '' : 's'} to unlock{' '}
                    <strong className="font-mono">{formatCurrency(nudge.unitPrice)}</strong>
                    /unit
                  </div>
                )}
              </Card>

              {/* Quantity + price block */}
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label
                    htmlFor="quantity"
                    className="mb-1.5 block text-sm font-medium text-dark"
                  >
                    Quantity
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Decrease quantity"
                      onClick={() => setQtyInput(String(Math.max(quantity - 1, moq)))}
                      disabled={quantity <= moq}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <input
                      id="quantity"
                      type="number"
                      inputMode="numeric"
                      min={moq}
                      value={qtyInput}
                      onChange={(e) => setQtyInput(e.target.value)}
                      onBlur={() => setQtyInput(String(quantity))}
                      className="input-field w-24 text-center font-mono"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Increase quantity"
                      onClick={() => setQtyInput(String(quantity + 1))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Minimum order: {moq} units
                    {selected.caseQty ? ` · ${selected.caseQty} per case` : ''}
                  </p>
                </div>

                <div className="ml-auto flex-1 rounded-lg bg-light p-4 sm:flex-none sm:min-w-[220px]">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Your price
                      </p>
                      <p className="font-mono text-2xl font-bold text-dark">
                        {formatCurrency(effective.price)}
                        <span className="text-sm font-normal text-gray-500">/unit</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
                      <p className="font-mono text-lg font-semibold text-dark">
                        {formatCurrency(parseFloat(effective.price) * quantity)}
                      </p>
                    </div>
                  </div>
                  {effective.tierApplied && (
                    <p className="mt-1 text-xs text-success">
                      Volume discount applied — base {formatCurrency(selected.unitPrice)}/unit
                    </p>
                  )}
                </div>
              </div>

              {/* CTA — sticky on mobile so it stays reachable while scrolling */}
              <div className="sticky bottom-2 z-10 rounded-xl bg-white p-3 shadow-lg ring-1 ring-gray-100 lg:static lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0">
                {verificationGate ? (
                  <Link
                    href="/settings/verification"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-orange px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-orange-dark focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Verify your business to purchase
                  </Link>
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    isLoading={isAdding}
                    disabled={selected.stockStatus === 'OUT_OF_STOCK'}
                    leftIcon={<ShoppingCart className="h-5 w-5" />}
                    onClick={handleAddToCart}
                  >
                    {selected.stockStatus === 'OUT_OF_STOCK'
                      ? 'Out of stock'
                      : `Add ${quantity} to cart · ${formatCurrency(
                          parseFloat(effective.price) * quantity
                        )}`}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
