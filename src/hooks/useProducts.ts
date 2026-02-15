'use client';

import { useQuery } from '@tanstack/react-query';

interface UseProductsOptions {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  stockStatus?: string;
  minRating?: number;
  sort?: string;
  page?: number;
  limit?: number;
}

/** Fetch product list with search/filter/sort/pagination */
export function useProducts(options: UseProductsOptions = {}) {
  const params = new URLSearchParams();
  if (options.q) params.set('q', options.q);
  if (options.category) params.set('category', options.category);
  if (options.minPrice !== undefined) params.set('minPrice', String(options.minPrice));
  if (options.maxPrice !== undefined) params.set('maxPrice', String(options.maxPrice));
  if (options.stockStatus) params.set('stockStatus', options.stockStatus);
  if (options.minRating !== undefined) params.set('minRating', String(options.minRating));
  if (options.sort) params.set('sort', options.sort);
  params.set('page', String(options.page || 1));
  params.set('limit', String(options.limit || 24));

  return useQuery({
    queryKey: ['products', options],
    queryFn: async () => {
      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
  });
}

/** Fetch single product detail with suppliers */
export function useProduct(productId: string | null) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) throw new Error('Failed to fetch product');
      return res.json();
    },
    enabled: !!productId,
  });
}
