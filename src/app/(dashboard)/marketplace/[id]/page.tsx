import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { ProductDetailClient } from './ProductDetailClient';

interface PageProps {
  params: { id: string };
}

/**
 * /marketplace/[id] — buyer-facing Product Detail page.
 *
 * Accepts either the Product cuid or the human-friendly `productId`
 * (PRD001…) in the URL. Server component: fetches via Prisma, serializes
 * all Decimals to strings at the boundary, and hands everything to the
 * client component for interaction (supplier select, tier ladder, cart).
 */
export default async function ProductDetailPage({ params }: PageProps) {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  const product = await prisma.product.findFirst({
    where: { OR: [{ id: params.id }, { productId: params.id }] },
    select: {
      id: true,
      name: true,
      sku: true,
      upcCode: true,
      brand: true,
      description: true,
      ageRestricted: true,
      minimumAge: true,
      imageUrl: true,
      unitsPerCase: true,
      category: { select: { name: true } },
      pricings: {
        where: { isActive: true, visibility: 'PUBLIC' },
        select: {
          id: true,
          wholesalePrice: true,
          minimumOrderQty: true,
          caseQty: true,
          stockStatus: true,
          leadTimeDays: true,
          wholesaler: { select: { id: true, name: true, ratingAvg: true } },
          tiers: {
            orderBy: { minQty: 'asc' },
            select: { id: true, minQty: true, unitPrice: true },
          },
        },
      },
    },
  });

  if (!product) notFound();

  // Retailer verification gates the add-to-cart CTA on age-restricted SKUs.
  let verificationStatus:
    | 'UNVERIFIED'
    | 'PENDING_REVIEW'
    | 'VERIFIED'
    | 'REJECTED'
    | null = null;
  if (user.role === 'RETAILER' && user.retailerId) {
    const retailer = await prisma.retailer.findUnique({
      where: { id: user.retailerId },
      select: { verificationStatus: true },
    });
    verificationStatus = retailer?.verificationStatus ?? null;
  }

  // Sort ascending by price (Decimal-safe) so the client can treat index 0
  // as BEST PRICE, then serialize Decimals to strings at the boundary.
  const suppliers = product.pricings
    .slice()
    .sort((a, b) => a.wholesalePrice.comparedTo(b.wholesalePrice))
    .map((p) => ({
      pricingId: p.id,
      wholesalerId: p.wholesaler.id,
      wholesalerName: p.wholesaler.name,
      ratingAvg: p.wholesaler.ratingAvg ? p.wholesaler.ratingAvg.toFixed(1) : null,
      unitPrice: p.wholesalePrice.toFixed(2),
      minimumOrderQty: p.minimumOrderQty,
      caseQty: p.caseQty,
      stockStatus: p.stockStatus,
      leadTimeDays: p.leadTimeDays,
      tiers: p.tiers.map((t) => ({
        id: t.id,
        minQty: t.minQty,
        unitPrice: t.unitPrice.toFixed(2),
      })),
    }));

  return (
    <ProductDetailClient
      product={{
        id: product.id,
        name: product.name,
        sku: product.sku,
        upcCode: product.upcCode,
        brand: product.brand,
        description: product.description,
        ageRestricted: product.ageRestricted,
        minimumAge: product.minimumAge,
        imageUrl: product.imageUrl,
        unitsPerCase: product.unitsPerCase,
        categoryName: product.category?.name ?? null,
      }}
      suppliers={suppliers}
      verificationStatus={verificationStatus}
    />
  );
}
