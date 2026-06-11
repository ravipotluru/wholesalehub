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
  shippingAddress: z.string().min(1, 'Address is required'),
  shippingCity: z.string().min(1, 'City is required'),
  shippingState: z.string().min(1, 'State is required'),
  shippingZip: z.string().min(1, 'ZIP code is required'),
  paymentMethod: z.enum(['NET30', 'CREDIT_CARD', 'ACH']),
  orderNotes: z.string().optional(),
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

// ─── Ship-to locations ───

export const locationSchema = z.object({
  label: z.string().min(1, 'Label is required').max(80),
  address: z.string().min(1, 'Street address is required').max(200),
  city: z.string().min(1, 'City is required').max(80),
  state: z
    .string()
    .length(2, 'Use the 2-letter state code')
    .transform((s) => s.toUpperCase()),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  contactName: z.string().max(120).optional().or(z.literal('')),
  contactPhone: z.string().max(30).optional().or(z.literal('')),
  isDefault: z.boolean().default(false),
});

export const locationPatchSchema = locationSchema.partial();

// ─── Buyer verification documents ───

export const buyerDocumentSchema = z.object({
  type: z.enum([
    'RESALE_CERTIFICATE',
    'EIN_LETTER',
    'TOBACCO_LICENSE',
    'STATE_BUSINESS_LICENSE',
    'OTHER',
  ]),
  fileName: z.string().min(1).max(255),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, 'Max file size is 10 MB')
    .optional(),
  /** Blob-storage URL once real upload is wired; optional for the metadata-only flow. */
  fileUrl: z.string().url().max(2000).optional(),
});

export const verificationDecisionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  /** Required for REJECT; emailed to the buyer verbatim. */
  reason: z.string().max(2000).optional(),
}).refine((d) => d.action !== 'REJECT' || (d.reason && d.reason.trim().length > 0), {
  message: 'A reason is required when rejecting',
  path: ['reason'],
});

// ─── Tier pricing ───

export const priceTiersSchema = z.object({
  tiers: z
    .array(
      z.object({
        minQty: z.number().int().min(1).max(1_000_000),
        unitPrice: z
          .string()
          .regex(/^\d{1,8}(\.\d{1,2})?$/, 'Price must be a positive amount like 12.50'),
      }),
    )
    .max(20, 'At most 20 tiers'),
}).superRefine((data, ctx) => {
  for (let i = 1; i < data.tiers.length; i++) {
    if (data.tiers[i].minQty <= data.tiers[i - 1].minQty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Tier ${i + 1} must start at a higher quantity than tier ${i}`,
        path: ['tiers', i, 'minQty'],
      });
    }
    if (parseFloat(data.tiers[i].unitPrice) >= parseFloat(data.tiers[i - 1].unitPrice)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Tier ${i + 1}'s price must be lower than tier ${i}'s — tiers must descend`,
        path: ['tiers', i, 'unitPrice'],
      });
    }
  }
});

// ─── Auth tokens (reset / verify) ───

export const requestResetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  signOutEverywhere: z.boolean().default(true),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
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
export type LocationInput = z.infer<typeof locationSchema>;
export type BuyerDocumentInput = z.infer<typeof buyerDocumentSchema>;
export type PriceTiersInput = z.infer<typeof priceTiersSchema>;
