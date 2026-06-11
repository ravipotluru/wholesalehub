'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  GripVertical,
  X,
  Plus,
  TrendingDown,
  Copy,
  BarChart3,
  Edit2,
  Check,
  AlertCircle,
  AlertOctagon,
  Loader2,
  User,
  Calendar,
  Zap,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';

interface ProductSummary {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string | null;
  isActive: boolean;
  basePrice: string;
  moq: number;
}

interface Tier {
  id?: string;
  minQty: number;
  unitPrice: string;
  /** Inclusive upper bound for display only — derived from next tier's minQty − 1. */
  _maxQtyDisplay?: number | null;
}

type Scope = 'all' | 'group' | 'negotiated';

const SAMPLE_TIERS: Tier[] = [
  { minQty: 6, unitPrice: '12.50' },
  { minQty: 12, unitPrice: '11.75' },
  { minQty: 24, unitPrice: '10.99' },
  { minQty: 48, unitPrice: '9.85' },
];

interface ValidationError {
  index: number;
  field: 'minQty' | 'unitPrice';
  message: string;
}

function validateTiers(tiers: Tier[]): ValidationError[] {
  const errors: ValidationError[] = [];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const price = parseFloat(t.unitPrice);
    if (isNaN(price) || price <= 0) {
      errors.push({ index: i, field: 'unitPrice', message: 'Price must be a positive number.' });
    }
    if (!Number.isFinite(t.minQty) || t.minQty < 1) {
      errors.push({ index: i, field: 'minQty', message: 'Quantity must be ≥ 1.' });
    }
    if (i > 0) {
      const prev = tiers[i - 1];
      const prevPrice = parseFloat(prev.unitPrice);
      if (t.minQty <= prev.minQty) {
        errors.push({
          index: i,
          field: 'minQty',
          message: `Tier ${i + 1} starts at ${t.minQty}, but tier ${i} starts at ${prev.minQty}. Each tier must start higher than the one above.`,
        });
      }
      if (!isNaN(prevPrice) && !isNaN(price) && price >= prevPrice) {
        errors.push({
          index: i,
          field: 'unitPrice',
          message: `Price ($${t.unitPrice}) must be lower than tier ${i}'s ($${prev.unitPrice}) — tiers must descend.`,
        });
      }
    }
  }
  return errors;
}

export function TierPricingEditor({
  product,
  initialTiers,
}: {
  product: ProductSummary;
  initialTiers: Tier[];
}) {
  const [tiers, setTiers] = useState<Tier[]>(
    initialTiers.length > 0 ? initialTiers : [],
  );
  const [savedTiers, setSavedTiers] = useState<Tier[]>(initialTiers);
  const [scope, setScope] = useState<Scope>('all');
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showLadder, setShowLadder] = useState(true);

  const errors = useMemo(() => validateTiers(tiers), [tiers]);
  const hasErrors = errors.length > 0;
  const dirty = JSON.stringify(tiers) !== JSON.stringify(savedTiers);

  const basePrice = parseFloat(product.basePrice);
  const sampleQty = 36;
  const sampleTier = tiers
    .slice()
    .reverse()
    .find((t) => sampleQty >= t.minQty);
  const samplePrice = sampleTier ? parseFloat(sampleTier.unitPrice) : basePrice;
  const sampleTotal = samplePrice * sampleQty;
  const sampleSavings = (basePrice - samplePrice) * sampleQty;

  const updateTier = (i: number, patch: Partial<Tier>) => {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };

  const removeTier = (i: number) => setTiers((prev) => prev.filter((_, idx) => idx !== i));

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const lastPrice = last ? parseFloat(last.unitPrice) : basePrice;
    setTiers((prev) => [
      ...prev,
      {
        minQty: last ? last.minQty * 2 : product.moq,
        unitPrice: (lastPrice * 0.9).toFixed(2),
      },
    ]);
  };

  const startLadder = () => setTiers(SAMPLE_TIERS);

  const onSave = () => {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/products/${product.id}/pricing/tiers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tiers: tiers.map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice })),
            scope,
          }),
        });
        if (!res.ok) {
          // 404 here is the route's deliberate PRICING_NOT_FOUND (no listing
          // for this product on your account) — surface it, never mask it.
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? 'Save failed.');
        }
        setSavedTiers(tiers);
      } catch (e) {
        setServerError((e as Error).message);
      }
    });
  };

  const maxPrice = Math.max(...tiers.map((t) => parseFloat(t.unitPrice) || 0), basePrice);

  return (
    <div className="space-y-4">
      <ProductHeader product={product} />

      {hasErrors && tiers.length > 0 && (
        <ErrorBanner
          title={`${errors.length} ${errors.length === 1 ? 'issue' : 'issues'} prevent publishing`}
          message={errors.map((e) => e.message).join(' ')}
        />
      )}

      {serverError && <ErrorBanner title="Save failed" message={serverError} />}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
        <div className="space-y-4">
          {tiers.length === 0 ? (
            <EmptyTiers
              basePrice={product.basePrice}
              onAdd={startLadder}
            />
          ) : (
            <>
              <TierTable
                tiers={tiers}
                errors={errors}
                basePrice={basePrice}
                onChange={updateTier}
                onRemove={removeTier}
                onAdd={addTier}
              />

              {showLadder && (
                <LadderPreview
                  tiers={tiers}
                  maxPrice={maxPrice}
                  sampleQty={sampleQty}
                  samplePrice={samplePrice}
                  sampleTotal={sampleTotal}
                  sampleSavings={sampleSavings}
                  onToggle={() => setShowLadder(false)}
                />
              )}
            </>
          )}
        </div>

        <aside className="space-y-3.5">
          <ScopePicker scope={scope} onChange={setScope} />
          <EligibleGroups />
          <EffectiveDates />
        </aside>
      </div>

      {tiers.length > 0 && (
        <SaveBar
          dirty={dirty}
          hasErrors={hasErrors}
          pending={pending}
          onDiscard={() => setTiers(savedTiers)}
          onSave={onSave}
        />
      )}
    </div>
  );
}

function ProductHeader({ product }: { product: ProductSummary }) {
  const initials = (product.brand ?? product.name).slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-5 py-4">
      <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-lg flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold truncate">{product.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          <span className="font-mono">{product.sku}</span>
          {product.category ? ` · ${product.category}` : ''}
          {` · MOQ ${product.moq}`}
        </p>
      </div>
      <span
        className={cn(
          'inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full',
          product.isActive ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-700',
        )}
      >
        {product.isActive ? 'Active' : 'Draft'}
      </span>
    </div>
  );
}

function EmptyTiers({ basePrice, onAdd }: { basePrice: string; onAdd: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Volume tiers</h3>
        <span className="text-xs text-gray-500">Currently flat-priced</span>
      </div>
      <div className="px-6 py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-brand-blue/[0.08] text-brand-blue flex items-center justify-center mx-auto mb-3.5">
          <TrendingDown className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold">No tiers configured</h3>
        <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto leading-relaxed">
          Buyers pay <strong className="font-mono text-dark">${basePrice}</strong>/unit at any
          quantity. Add tiers to incentivize bigger cases — most sellers see 18% more
          case-quantity orders.
        </p>
        <div className="mt-5 inline-flex flex-wrap gap-2 justify-center">
          <Button
            type="button"
            variant="primary"
            size="md"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={onAdd}
          >
            Add tier ladder
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            leftIcon={<Copy className="h-3.5 w-3.5" />}
          >
            Copy from another product
          </Button>
        </div>
      </div>
    </div>
  );
}

function TierTable({
  tiers,
  errors,
  basePrice,
  onChange,
  onRemove,
  onAdd,
}: {
  tiers: Tier[];
  errors: ValidationError[];
  basePrice: number;
  onChange: (i: number, patch: Partial<Tier>) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-3">
        <h3 className="text-sm font-semibold flex-1">Volume tiers</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">Base price</span>
          <span className="font-mono font-semibold">${basePrice.toFixed(2)}</span>
          <Button type="button" variant="ghost" size="sm" leftIcon={<Edit2 className="h-3 w-3" />}>
            Edit
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-3 py-2.5 w-8"></th>
              <th className="px-3 py-2.5 text-left">Quantity</th>
              <th className="px-3 py-2.5 text-right">Per-unit price</th>
              <th className="px-3 py-2.5 text-right">Discount</th>
              <th className="px-3 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, i) => {
              const next = tiers[i + 1];
              const maxLabel = next ? String(next.minQty - 1) : '∞';
              const rowErrors = errors.filter((e) => e.index === i);
              const price = parseFloat(tier.unitPrice);
              const discountPct =
                isFinite(price) && basePrice > 0
                  ? ((price - basePrice) / basePrice) * 100
                  : 0;
              const isErr = rowErrors.length > 0;
              return (
                <tr
                  key={i}
                  className={cn(
                    'border-t border-gray-100',
                    isErr && 'bg-status-error/[0.03]',
                  )}
                >
                  <td className="px-3 py-3">
                    <GripVertical className="h-3.5 w-3.5 text-gray-400 cursor-grab" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 font-mono">
                      <input
                        type="number"
                        min="1"
                        value={tier.minQty}
                        onChange={(e) =>
                          onChange(i, { minQty: parseInt(e.target.value, 10) || 0 })
                        }
                        className={cn(
                          'w-16 px-2 py-1.5 border rounded text-xs text-right',
                          rowErrors.some((e) => e.field === 'minQty')
                            ? 'border-status-error bg-status-error/[0.04] text-status-error'
                            : 'border-gray-300',
                        )}
                      />
                      <span className="text-gray-400">–</span>
                      <span className="w-16 text-center text-gray-400">{maxLabel}</span>
                    </div>
                    {rowErrors
                      .filter((e) => e.field === 'minQty')
                      .map((e, idx) => (
                        <p
                          key={idx}
                          className="text-[11px] text-status-error mt-1.5 flex items-center gap-1"
                        >
                          <AlertCircle className="h-3 w-3 flex-shrink-0" />
                          {e.message}
                        </p>
                      ))}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      type="text"
                      value={`$${tier.unitPrice}`}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.]/g, '');
                        onChange(i, { unitPrice: raw });
                      }}
                      className={cn(
                        'w-24 px-2 py-1.5 border rounded text-xs text-right font-mono',
                        rowErrors.some((e) => e.field === 'unitPrice')
                          ? 'border-status-error bg-status-error/[0.04] text-status-error'
                          : 'border-gray-300',
                      )}
                    />
                    {rowErrors
                      .filter((e) => e.field === 'unitPrice')
                      .map((e, idx) => (
                        <p
                          key={idx}
                          className="text-[11px] text-status-error mt-1.5 flex items-center gap-1 justify-end"
                        >
                          <AlertCircle className="h-3 w-3 flex-shrink-0" />
                          {e.message}
                        </p>
                      ))}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-3 text-right font-mono font-semibold',
                      i === 0 && 'text-gray-500',
                      i > 0 && discountPct < 0 && 'text-success',
                      i > 0 && discountPct > 0 && 'text-status-error',
                    )}
                  >
                    {i === 0 ? '—' : `${discountPct >= 0 ? '+' : ''}${discountPct.toFixed(0)}%`}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      className="text-gray-400 hover:text-status-error hover:bg-status-error/[0.06] p-1 rounded"
                      aria-label="Remove tier"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-3.5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-dashed border-gray-300 text-brand-blue text-sm font-medium hover:bg-brand-blue/[0.05] hover:border-brand-blue"
        >
          <Plus className="h-3.5 w-3.5" />
          Add tier
        </button>
        {errors.length > 0 && (
          <button
            type="button"
            onClick={() => {
              /* TODO: gap auto-fix logic */
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-dashed border-success/40 text-success text-sm font-medium hover:bg-success/[0.05]"
          >
            <Zap className="h-3.5 w-3.5" />
            Auto-fix gaps
          </button>
        )}
      </div>
    </div>
  );
}

function LadderPreview({
  tiers,
  maxPrice,
  sampleQty,
  samplePrice,
  sampleTotal,
  sampleSavings,
  onToggle,
}: {
  tiers: Tier[];
  maxPrice: number;
  sampleQty: number;
  samplePrice: number;
  sampleTotal: number;
  sampleSavings: number;
  onToggle: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
        <BarChart3 className="h-3.5 w-3.5 text-brand-blue" />
        Ladder preview
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-[11px] text-gray-500 hover:text-dark font-normal"
        >
          Hide
        </button>
      </h4>
      <div className="px-1 pt-6 pb-8">
        <div className="flex items-end gap-2 h-32">
          {tiers.map((tier, i) => {
            const next = tiers[i + 1];
            const maxLabel = next ? String(next.minQty - 1) : '∞';
            const price = parseFloat(tier.unitPrice);
            const heightPct = maxPrice > 0 ? (price / maxPrice) * 100 : 100;
            return (
              <div
                key={i}
                className="flex-1 min-w-[50px] relative rounded-t-md"
                style={{
                  height: `${heightPct}%`,
                  background:
                    'linear-gradient(180deg, var(--color-brand-blue, #1E4D8C) 0%, #2563A8 100%)',
                  backgroundColor: '#1E4D8C',
                }}
              >
                <span className="absolute -top-5 left-0 right-0 text-center font-mono text-[11px] text-gray-500">
                  {tier.minQty}–{maxLabel}
                </span>
                <span className="absolute -bottom-5 left-0 right-0 text-center font-mono text-xs font-semibold text-dark">
                  ${tier.unitPrice}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-brand-blue/[0.04] border border-brand-blue/20 rounded-lg px-4 py-3 flex items-center gap-3 mt-4">
        <div className="w-9 h-9 rounded-lg bg-white text-brand-blue flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4" />
        </div>
        <p className="text-xs text-gray-700 leading-relaxed">
          <strong className="text-dark">Sample order:</strong> A buyer orders{' '}
          <span className="font-mono">{sampleQty} units</span> → pays{' '}
          <span className="font-mono">${samplePrice.toFixed(2)}/unit</span> ={' '}
          <span className="font-mono font-bold text-dark">${sampleTotal.toFixed(2)}</span>
          {sampleSavings > 0 && (
            <>
              {' '}· saves <span className="font-mono">${sampleSavings.toFixed(2)}</span> vs. base.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function ScopePicker({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  const options: { id: Scope; title: string; desc: string }[] = [
    { id: 'all', title: 'All buyers', desc: 'Same ladder applies to every approved retailer.' },
    {
      id: 'group',
      title: 'By customer group',
      desc: 'Different tiers for VIP, regional, or wholesale partners.',
    },
    { id: 'negotiated', title: 'Negotiated only', desc: 'Hide ladder, manual quotes per buyer.' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold mb-2.5">Pricing scope</h4>
      <div className="space-y-1">
        {options.map((opt) => {
          const selected = scope === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                'w-full text-left p-2.5 rounded-md flex items-start gap-2 transition-colors',
                selected ? 'bg-brand-blue/[0.05]' : 'hover:bg-gray-50',
              )}
            >
              <span
                className={cn(
                  'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 relative',
                  selected ? 'border-brand-blue' : 'border-gray-300',
                )}
              >
                {selected && (
                  <span className="absolute inset-0.5 rounded-full bg-brand-blue" />
                )}
              </span>
              <span className="flex-1">
                <p className="text-sm font-medium text-dark">{opt.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EligibleGroups() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold mb-2.5">Eligible groups</h4>
      <div className="flex flex-wrap gap-1.5">
        {['All retailers', 'Verified', 'Net-30', 'VIP'].map((g, i) => (
          <span
            key={g}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium',
              i === 0 ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-700',
            )}
          >
            {i === 0 && <Check className="h-3 w-3" />}
            {g}
          </span>
        ))}
      </div>
    </div>
  );
}

function EffectiveDates() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold mb-2.5">Effective dates</h4>
      <p className="text-xs text-gray-500 leading-relaxed">
        Live <strong className="text-success">now</strong> until you change it. Schedule a future
        change from the calendar.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        leftIcon={<Calendar className="h-3.5 w-3.5" />}
        className="mt-2.5 w-full justify-center"
      >
        Schedule change
      </Button>
    </div>
  );
}

function SaveBar({
  dirty,
  hasErrors,
  pending,
  onDiscard,
  onSave,
}: {
  dirty: boolean;
  hasErrors: boolean;
  pending: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-3.5 z-10 px-4 py-3 bg-white border rounded-xl flex items-center justify-between flex-wrap gap-3 shadow-sm transition-colors',
        hasErrors ? 'border-status-error/30' : 'border-gray-200',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm">
        {hasErrors ? (
          <>
            <AlertOctagon className="h-3.5 w-3.5 text-status-error" />
            <span className="text-status-error font-medium">
              Errors must be fixed before publishing.
            </span>
          </>
        ) : dirty ? (
          <>
            <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse" />
            <span className="text-dark font-medium">Unsaved changes.</span>
          </>
        ) : (
          <>
            <Info className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-gray-500">All changes saved.</span>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={!dirty || pending}
        >
          Discard
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={hasErrors || !dirty || pending}
          leftIcon={
            pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />
          }
          onClick={onSave}
        >
          {pending ? 'Saving…' : 'Publish ladder'}
        </Button>
      </div>
    </div>
  );
}
