'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────

interface MyProductFilters {
  q?: string;
  category?: string;
  stockStatus?: string;
  status?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

interface ProductUpdatePayload {
  id: string;
  name?: string;
  description?: string;
  brand?: string;
  categoryId?: string;
  subCategory?: string;
  wholesalePrice?: number;
  msrp?: number;
  minimumOrderQty?: number;
  caseQuantity?: number;
  pricePerCase?: number;
  stockQuantity?: number;
  stockStatus?: string;
  leadTimeDays?: number;
  onPromotion?: boolean;
  promoPrice?: number;
  promoStartDate?: string;
  promoEndDate?: string;
  color?: string;
  size?: string;
  material?: string;
  flavor?: string;
  nicotineStrength?: string;
  unitOfMeasure?: string;
  unitsPerCase?: number;
  weight?: number;
  ageRestricted?: boolean;
  minimumAge?: number;
  restrictedStates?: string[];
  imageUrl?: string;
  additionalImages?: string[];
  isActive?: boolean;
}

interface ProductCreatePayload extends Omit<ProductUpdatePayload, 'id'> {
  sku: string;
  name: string;
  wholesalePrice: number;
}

interface OrderStatusUpdatePayload {
  orderId: string;
  status: string;
  trackingNumber?: string;
  shippingCarrier?: string;
  cancellationReason?: string;
}

interface PricingComparisonItem {
  productId: string;
  productName: string;
  sku: string;
  yourPrice: number;
  marketAvg: number;
  lowestCompetitor: number;
  yourRank: number;
  totalSuppliers: number;
  gapPercent: number;
  gapDollar: number;
}

interface PricingData {
  avgPrice: number;
  productsOnPromotion: number;
  priceChanges30d: number;
  competitivePosition: string;
  comparisons: PricingComparisonItem[];
  promotions: {
    id: string;
    productName: string;
    promoPrice: number;
    originalPrice: number;
    startDate: string;
    endDate: string;
  }[];
}

// ── useMyProducts ──────────────────────────────────────────────────

/** Fetch wholesaler's own products with search/filter/sort/pagination */
export function useMyProducts(filters: MyProductFilters = {}) {
  const params = new URLSearchParams();
  params.set('wholesalerId', 'current');
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.stockStatus) params.set('stockStatus', filters.stockStatus);
  if (filters.status) params.set('status', filters.status);
  if (filters.sort) params.set('sort', filters.sort);
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 20));

  return useQuery({
    queryKey: ['my-products', filters],
    queryFn: async () => {
      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
  });
}

// ── useIncomingOrders ──────────────────────────────────────────────

/** Fetch incoming orders for the wholesaler with optional status filter */
export function useIncomingOrders(status?: string, page: number = 1) {
  const params = new URLSearchParams();
  params.set('role', 'wholesaler');
  if (status && status !== 'all') params.set('status', status);
  params.set('page', String(page));
  params.set('limit', '20');

  return useQuery({
    queryKey: ['incoming-orders', status, page],
    queryFn: async () => {
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch incoming orders');
      return res.json();
    },
  });
}

// ── usePricingData ─────────────────────────────────────────────────

/** Fetch pricing comparison data for the wholesaler */
export function usePricingData() {
  return useQuery<PricingData>({
    queryKey: ['pricing-data'],
    queryFn: async () => {
      const res = await fetch('/api/products?wholesalerId=current&pricing=true');
      if (!res.ok) throw new Error('Failed to fetch pricing data');
      return res.json();
    },
  });
}

// ── useUpdateProduct ───────────────────────────────────────────────

/** Mutation to update or create a product */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ProductUpdatePayload) => {
      const { id, ...body } = data;
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update product');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Product updated successfully');
      queryClient.invalidateQueries({ queryKey: ['my-products'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/** Mutation to create a new product */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ProductCreatePayload) => {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create product');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Product created successfully');
      queryClient.invalidateQueries({ queryKey: ['my-products'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ── useUpdateOrderStatus ───────────────────────────────────────────

/** Mutation to update an incoming order's status (confirm, process, ship, reject) */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, ...data }: OrderStatusUpdatePayload) => {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update order status');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Order status updated');
      queryClient.invalidateQueries({ queryKey: ['incoming-orders'] });
      queryClient.invalidateQueries({ queryKey: ['incoming-order'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export type {
  MyProductFilters,
  ProductUpdatePayload,
  ProductCreatePayload,
  OrderStatusUpdatePayload,
  PricingComparisonItem,
  PricingData,
};
