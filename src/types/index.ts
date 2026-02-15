import type {
  User, Wholesaler, Retailer, Product, Category, ProductPricing,
  PriceHistory, CartItem, Order, OrderLine, InventoryReceipt,
  ReceiptLine, Discrepancy
} from '@prisma/client';

// Re-export prisma types
export type {
  User, Wholesaler, Retailer, Product, Category, ProductPricing,
  PriceHistory, CartItem, Order, OrderLine, InventoryReceipt,
  ReceiptLine, Discrepancy
};

/** Product with supplier pricing aggregates for marketplace listing */
export interface ProductWithPricing extends Product {
  category: Category | null;
  pricings: (ProductPricing & { wholesaler: Wholesaler })[];
  lowestPrice: number;
  highestPrice: number;
  supplierCount: number;
  avgRating: number;
  bestSupplier: {
    name: string;
    price: number;
    city: string;
    state: string;
    wholesalerId: string;
  } | null;
}

/** Product detail with full supplier comparison data */
export interface ProductDetail extends Product {
  category: Category | null;
  suppliers: SupplierOffer[];
  priceHistory: PriceHistory[];
}

/** Single supplier's offer for a product */
export interface SupplierOffer {
  wholesalerId: string;
  wholesalerName: string;
  city: string;
  state: string;
  ratingAvg: number;
  ratingCount: number;
  wholesalePrice: number;
  msrp: number | null;
  minimumOrderQty: number;
  stockQuantity: number;
  stockStatus: string;
  leadTimeDays: number | null;
  onPromotion: boolean;
  promoPrice: number | null;
  isBestPrice: boolean;
  savingsVsHighest: number;
}

/** Cart grouped by supplier */
export interface CartGroup {
  wholesalerId: string;
  wholesalerName: string;
  city: string;
  state: string;
  items: CartItemWithProduct[];
  subtotal: number;
  moqMet: boolean;
}

export interface CartItemWithProduct extends CartItem {
  product: Product;
  moqRequired: number;
  moqMet: boolean;
}

/** Order with lines for detail view */
export interface OrderWithDetails extends Order {
  retailer: Retailer;
  wholesaler: Wholesaler;
  lines: (OrderLine & { product: Product })[];
}

/** Receipt with lines for detail view */
export interface ReceiptWithDetails extends InventoryReceipt {
  lines: (ReceiptLine & { product: Product | null })[];
  discrepancies: Discrepancy[];
}

/** API pagination response */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** API error response */
export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
  violations?: { policy: string; reason: string }[];
}

/** Analytics KPI data */
export interface AnalyticsKPIs {
  revenue30d: number;
  orders30d: number;
  avgOrderValue: number;
  activeProducts: number;
  activeSuppliers: number;
}

/** Category with product count */
export interface CategoryWithCount extends Category {
  _count: { products: number };
  children: CategoryWithCount[];
}

/** Search filters state */
export interface SearchFilters {
  q: string;
  category: string;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  stockStatus: string;
  minRating: number | undefined;
  sort: 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'popular';
  page: number;
}

/** Dashboard receiving stats */
export interface ReceivingStats {
  receiptsToday: number;
  itemsReceived: number;
  openDiscrepancies: number;
  onTimePercent: number;
}

/** Session user (from NextAuth) */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  retailerId: string | null;
  wholesalerId: string | null;
}
