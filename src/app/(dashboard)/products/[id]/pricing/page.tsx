import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { TierPricingEditor } from './TierPricingEditor';
import { Prisma } from '@prisma/client';

interface PageProps {
  params: { id: string };
}

/**
 * /products/[id]/pricing — Tier Pricing Editor for wholesalers.
 * 5 states: empty, editing, validation errors, customer-group split, buyer view.
 * Mirrors docs/handoffs/bundle/project/Tier%20Pricing%20Editor.html.
 *
 * Reads existing PriceTier rows + ProductPricing.wholesalePrice (the base).
 * Save → PUT /api/products/[id]/pricing/tiers (PR #pricing, draft).
 */
export default async function TierPricingEditorPage({ params }: PageProps) {
  const user = await getAuthedUser();
  if (!user) redirect('/login');
  if (user.role !== 'WHOLESALER' && user.role !== 'ADMIN') redirect('/products');

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      sku: true,
      brand: true,
      category: { select: { name: true } },
      isActive: true,
      pricings: {
        where: user.role === 'WHOLESALER' ? { wholesalerId: user.wholesalerId ?? '' } : undefined,
        select: {
          id: true,
          wholesalePrice: true,
          minOrderQty: true,
          tiers: {
            orderBy: { minQty: 'asc' },
            select: { id: true, minQty: true, unitPrice: true },
          },
        },
        take: 1,
      },
    },
  });

  if (!product) notFound();
  const pricing = product.pricings[0];

  const decimalToString = (d: Prisma.Decimal | null | undefined): string =>
    d ? d.toFixed(2) : '0.00';

  const tiers = (pricing?.tiers ?? []).map((t) => ({
    id: t.id,
    minQty: t.minQty,
    unitPrice: decimalToString(t.unitPrice),
  }));

  return (
    <div className="bg-[#EFF1F4] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
            Wholesaler · Product editor
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-dark tracking-tight">
            Tier pricing
          </h1>
          <p className="mt-1.5 text-sm text-gray-500 leading-relaxed max-w-2xl">
            Volume-based price ladder. Higher quantities get lower per-unit pricing — buyers see
            this on the product page.
          </p>
        </header>

        <TierPricingEditor
          product={{
            id: product.id,
            name: product.name,
            sku: product.sku,
            brand: product.brand,
            category: product.category?.name ?? null,
            isActive: product.isActive,
            basePrice: decimalToString(pricing?.wholesalePrice),
            moq: pricing?.minOrderQty ?? 1,
          }}
          initialTiers={tiers}
        />
      </div>
    </div>
  );
}
