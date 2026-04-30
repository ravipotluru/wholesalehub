import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
  confirmPassword: z.string(),
  role: z.enum(['RETAILER', 'WHOLESALER']),
  businessName: z.string().min(1, 'Business name is required'),
  phone: z.string().optional(),
  ageVerified: z.literal(true, {
    errorMap: () => ({ message: 'You must verify that you are 21 or older' }),
  }),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms and conditions' }),
  }),
  // Retailer fields
  storeType: z.string().optional(),
  storeAddress: z.string().optional(),
  storeCity: z.string().optional(),
  storeState: z.string().optional(),
  storeZip: z.string().optional(),
  // Wholesaler fields
  licenseNumber: z.string().optional(),
  licenseState: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const addToCartSchema = z.object({
  productId: z.string().min(1),
  wholesalerId: z.string().min(1),
  quantity: z.number().int().positive('Quantity must be positive'),
});

export const checkoutSchema = z.object({
  /**
   * Optional pointer to a saved RetailerLocation for chains. When provided,
   * the API verifies it belongs to the calling retailer + is active, then
   * snapshots the location's address into the order's `shipTo*` columns.
   * When omitted: the API picks the retailer's default location, then any
   * remaining active location, then falls back to the legacy address fields
   * below (retailers with zero locations).
   */
  shipToLocationId: z.string().min(1).optional(),
  shippingAddress: z.string().min(1, 'Address is required').optional(),
  shippingCity: z.string().min(1, 'City is required').optional(),
  shippingState: z.string().min(1, 'State is required').optional(),
  shippingZip: z.string().min(1, 'ZIP code is required').optional(),
  paymentMethod: z.enum(['NET30', 'CREDIT_CARD', 'ACH']),
  orderNotes: z.string().optional(),
});

/**
 * Body for POST /api/retailer/locations. `isDefault: true` causes the API
 * to atomically clear `isDefault` on every other row for the same retailer
 * inside the same `$transaction` so we can never end up with two defaults.
 */
export const createRetailerLocationSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100),
  address: z.string().min(1, 'Address is required').max(255),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(50),
  zipCode: z.string().min(1, 'ZIP code is required').max(20),
  contactName: z.string().max(100).optional(),
  contactPhone: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
});

/**
 * Body for PATCH /api/retailer/locations/[id]. Same isDefault flip as create.
 */
export const updateRetailerLocationSchema = z
  .object({
    label: z.string().min(1).max(100).optional(),
    address: z.string().min(1).max(255).optional(),
    city: z.string().min(1).max(100).optional(),
    state: z.string().min(1).max(50).optional(),
    zipCode: z.string().min(1).max(20).optional(),
    contactName: z.string().max(100).nullable().optional(),
    contactPhone: z.string().max(50).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const stockStatusEnum = z.enum([
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'BACKORDER',
]);

export const productSearchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  stockStatus: stockStatusEnum.optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z
    .enum(['price_asc', 'price_desc', 'rating', 'newest', 'popular', 'relevance'])
    .default('relevance'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(24),
});

export const barcodeScanSchema = z.object({
  receiptId: z.string().min(1),
  barcode: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  condition: z.enum(['GOOD', 'DAMAGED_MINOR', 'DAMAGED_MAJOR', 'WRONG_ITEM']).default('GOOD'),
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REJECTED']),
  trackingNumber: z.string().optional(),
  shippingCarrier: z.string().optional(),
  cancellationReason: z.string().optional(),
});

/**
 * Schema for ASN webhook payloads from suppliers. Validated AFTER HMAC
 * passes — defends against compromised supplier API keys / malformed JSON.
 */
export const inventoryWebhookSchema = z.object({
  supplier_id: z.string().min(1),
  document_id: z.string().optional(),
  po_number: z.string().optional(),
  document_type: z.string().optional(),
  carrier: z.string().optional(),
  tracking_number: z.string().optional(),
  ship_date: z.string().datetime().optional(),
  expected_date: z.string().datetime().optional(),
  line_items: z
    .array(
      z.object({
        sku: z.string().min(1),
        upc: z.string().optional(),
        product_name: z.string().min(1),
        quantity: z.number().int().nonnegative(),
        unit_cost: z.number().nonnegative().optional(),
      }),
    )
    .max(10000, 'Too many line items'),
}).refine((p) => !!(p.po_number || p.document_id), {
  message: 'Either po_number or document_id is required',
  path: ['po_number'],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ProductSearchInput = z.infer<typeof productSearchSchema>;
export type BarcodeScanInput = z.infer<typeof barcodeScanSchema>;
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
export type InventoryWebhookPayload = z.infer<typeof inventoryWebhookSchema>;
export type StockStatus = z.infer<typeof stockStatusEnum>;
export type CreateRetailerLocationInput = z.infer<typeof createRetailerLocationSchema>;
export type UpdateRetailerLocationInput = z.infer<typeof updateRetailerLocationSchema>;
