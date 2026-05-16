/**
 * Zod Validation Schema Tests
 *
 * Tests for src/lib/validators.ts — all exported Zod schemas.
 */

import {
  loginSchema,
  registerSchema,
  addToCartSchema,
  checkoutSchema,
  productSearchSchema,
  barcodeScanSchema,
  orderStatusUpdateSchema,
  createRetailerLocationSchema,
  updateRetailerLocationSchema,
} from '@/lib/validators';

// ─── loginSchema ───

describe('loginSchema', () => {
  it('should accept valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'secret123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'secret',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailErr = result.error.issues.find((i) => i.path.includes('email'));
      expect(emailErr).toBeDefined();
    }
  });

  it('should reject empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing fields', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── registerSchema ───

describe('registerSchema', () => {
  const validData = {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    password: 'MyStr0ng!Pass1',
    confirmPassword: 'MyStr0ng!Pass1',
    role: 'RETAILER' as const,
    businessName: 'Quick Stop',
    ageVerified: true as const,
    termsAccepted: true as const,
  };

  it('should accept valid registration data', () => {
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject password shorter than 12 characters', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'Short1!',
      confirmPassword: 'Short1!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without uppercase letter', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'mystr0ng!pass1',
      confirmPassword: 'mystr0ng!pass1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without lowercase letter', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'MYSTR0NG!PASS1',
      confirmPassword: 'MYSTR0NG!PASS1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without a number', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'MyStrong!Passx',
      confirmPassword: 'MyStrong!Passx',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password without a special character', () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: 'MyStr0ngPass12',
      confirmPassword: 'MyStr0ngPass12',
    });
    expect(result.success).toBe(false);
  });

  it('should reject when confirmPassword does not match password', () => {
    const result = registerSchema.safeParse({
      ...validData,
      confirmPassword: 'DifferentPass1!',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmErr = result.error.issues.find((i) =>
        i.path.includes('confirmPassword')
      );
      expect(confirmErr).toBeDefined();
      expect(confirmErr?.message).toBe('Passwords do not match');
    }
  });

  it('should reject missing firstName', () => {
    const { firstName, ...rest } = validData;
    const result = registerSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing businessName', () => {
    const result = registerSchema.safeParse({
      ...validData,
      businessName: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject role values outside enum', () => {
    const result = registerSchema.safeParse({
      ...validData,
      role: 'ADMIN',
    });
    expect(result.success).toBe(false);
  });

  it('should require ageVerified to be true', () => {
    const result = registerSchema.safeParse({
      ...validData,
      ageVerified: false,
    });
    expect(result.success).toBe(false);
  });

  it('should require termsAccepted to be true', () => {
    const result = registerSchema.safeParse({
      ...validData,
      termsAccepted: false,
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional retailer fields', () => {
    const result = registerSchema.safeParse({
      ...validData,
      storeType: 'SMOKE_SHOP',
      storeAddress: '123 Main St',
      storeCity: 'Houston',
      storeState: 'TX',
      storeZip: '77001',
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional wholesaler fields', () => {
    const result = registerSchema.safeParse({
      ...validData,
      role: 'WHOLESALER' as const,
      licenseNumber: 'LIC-12345',
      licenseState: 'TX',
    });
    expect(result.success).toBe(true);
  });

  it('should reject firstName exceeding 50 characters', () => {
    const result = registerSchema.safeParse({
      ...validData,
      firstName: 'A'.repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

// ─── addToCartSchema ───

describe('addToCartSchema', () => {
  it('should accept valid cart item', () => {
    const result = addToCartSchema.safeParse({
      productId: 'prod-1',
      wholesalerId: 'ws-1',
      quantity: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-positive quantity', () => {
    const result = addToCartSchema.safeParse({
      productId: 'prod-1',
      wholesalerId: 'ws-1',
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative quantity', () => {
    const result = addToCartSchema.safeParse({
      productId: 'prod-1',
      wholesalerId: 'ws-1',
      quantity: -5,
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer quantity', () => {
    const result = addToCartSchema.safeParse({
      productId: 'prod-1',
      wholesalerId: 'ws-1',
      quantity: 3.5,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty productId', () => {
    const result = addToCartSchema.safeParse({
      productId: '',
      wholesalerId: 'ws-1',
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty wholesalerId', () => {
    const result = addToCartSchema.safeParse({
      productId: 'prod-1',
      wholesalerId: '',
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });
});

// ─── checkoutSchema ───

describe('checkoutSchema', () => {
  const validCheckout = {
    shippingAddress: '456 Commerce Blvd',
    shippingCity: 'Dallas',
    shippingState: 'TX',
    shippingZip: '75201',
    paymentMethod: 'NET30' as const,
  };

  it('should accept valid checkout data', () => {
    const result = checkoutSchema.safeParse(validCheckout);
    expect(result.success).toBe(true);
  });

  it('should accept optional orderNotes', () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      orderNotes: 'Please deliver before noon',
    });
    expect(result.success).toBe(true);
  });

  it('should accept missing shippingAddress (validated route-side against shipToLocationId)', () => {
    // The shipping fields are optional at the schema layer because the
    // checkout route picks between shipToLocationId / saved locations /
    // legacy address. The route enforces "at least one path is valid"
    // — see retailer-locations tests.
    const { shippingAddress, ...rest } = validCheckout;
    const result = checkoutSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it('should accept a checkout with only shipToLocationId + paymentMethod', () => {
    const result = checkoutSchema.safeParse({
      shipToLocationId: 'loc_123',
      paymentMethod: 'NET30',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shipToLocationId).toBe('loc_123');
      expect(result.data.shippingAddress).toBeUndefined();
    }
  });

  it('should reject empty shippingCity', () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      shippingCity: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty shipToLocationId', () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      shipToLocationId: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid paymentMethod', () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      paymentMethod: 'BITCOIN',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid payment methods', () => {
    for (const method of ['NET30', 'CREDIT_CARD', 'ACH']) {
      const result = checkoutSchema.safeParse({
        ...validCheckout,
        paymentMethod: method,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ─── productSearchSchema ───

describe('productSearchSchema', () => {
  it('should accept empty object with defaults', () => {
    const result = productSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('price_asc');
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(24);
    }
  });

  it('should accept valid search parameters', () => {
    const result = productSearchSchema.safeParse({
      q: 'vape pen',
      category: 'vapes',
      minPrice: 5,
      maxPrice: 50,
      sort: 'rating',
      page: 2,
      limit: 12,
    });
    expect(result.success).toBe(true);
  });

  it('should coerce string numbers into numbers', () => {
    const result = productSearchSchema.safeParse({
      minPrice: '10',
      maxPrice: '100',
      page: '3',
      limit: '48',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minPrice).toBe(10);
      expect(result.data.maxPrice).toBe(100);
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(48);
    }
  });

  it('should reject invalid sort values', () => {
    const result = productSearchSchema.safeParse({
      sort: 'random',
    });
    expect(result.success).toBe(false);
  });

  it('should reject limit exceeding 100', () => {
    const result = productSearchSchema.safeParse({
      limit: 200,
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-positive page', () => {
    const result = productSearchSchema.safeParse({
      page: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid sort values', () => {
    for (const sort of ['price_asc', 'price_desc', 'rating', 'newest', 'popular']) {
      const result = productSearchSchema.safeParse({ sort });
      expect(result.success).toBe(true);
    }
  });
});

// ─── barcodeScanSchema ───

describe('barcodeScanSchema', () => {
  it('should accept valid barcode scan data', () => {
    const result = barcodeScanSchema.safeParse({
      receiptId: 'rcp-1',
      barcode: '012345678901',
      quantity: 5,
      condition: 'GOOD',
    });
    expect(result.success).toBe(true);
  });

  it('should apply default quantity of 1', () => {
    const result = barcodeScanSchema.safeParse({
      receiptId: 'rcp-1',
      barcode: '012345678901',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(1);
      expect(result.data.condition).toBe('GOOD');
    }
  });

  it('should reject empty receiptId', () => {
    const result = barcodeScanSchema.safeParse({
      receiptId: '',
      barcode: '012345678901',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty barcode', () => {
    const result = barcodeScanSchema.safeParse({
      receiptId: 'rcp-1',
      barcode: '',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid condition values', () => {
    for (const condition of ['GOOD', 'DAMAGED_MINOR', 'DAMAGED_MAJOR', 'WRONG_ITEM']) {
      const result = barcodeScanSchema.safeParse({
        receiptId: 'rcp-1',
        barcode: '012345678901',
        condition,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid condition value', () => {
    const result = barcodeScanSchema.safeParse({
      receiptId: 'rcp-1',
      barcode: '012345678901',
      condition: 'DESTROYED',
    });
    expect(result.success).toBe(false);
  });
});

// ─── orderStatusUpdateSchema ───

describe('orderStatusUpdateSchema', () => {
  it('should accept valid status update', () => {
    const result = orderStatusUpdateSchema.safeParse({
      status: 'SHIPPED',
      trackingNumber: 'TRK-12345',
      shippingCarrier: 'UPS',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all valid status values', () => {
    const statuses = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REJECTED'];
    for (const status of statuses) {
      const result = orderStatusUpdateSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid status', () => {
    const result = orderStatusUpdateSchema.safeParse({
      status: 'PENDING',
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional trackingNumber', () => {
    const result = orderStatusUpdateSchema.safeParse({
      status: 'SHIPPED',
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional cancellationReason', () => {
    const result = orderStatusUpdateSchema.safeParse({
      status: 'CANCELLED',
      cancellationReason: 'Customer requested cancellation',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cancellationReason).toBe('Customer requested cancellation');
    }
  });

  it('should reject when status field is missing', () => {
    const result = orderStatusUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── createRetailerLocationSchema ───

describe('createRetailerLocationSchema', () => {
  const validLocation = {
    label: 'Main Store',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
  };

  it('should accept a minimal valid location', () => {
    const result = createRetailerLocationSchema.safeParse(validLocation);
    expect(result.success).toBe(true);
  });

  it('should accept all optional fields', () => {
    const result = createRetailerLocationSchema.safeParse({
      ...validLocation,
      contactName: 'Janet',
      contactPhone: '555-0100',
      notes: 'Loading dock around back',
      isDefault: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty label', () => {
    const result = createRetailerLocationSchema.safeParse({
      ...validLocation,
      label: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty address', () => {
    const result = createRetailerLocationSchema.safeParse({
      ...validLocation,
      address: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty zipCode', () => {
    const result = createRetailerLocationSchema.safeParse({
      ...validLocation,
      zipCode: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject label exceeding 100 characters', () => {
    const result = createRetailerLocationSchema.safeParse({
      ...validLocation,
      label: 'A'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('should reject when address is missing', () => {
    const { address, ...rest } = validLocation;
    const result = createRetailerLocationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ─── updateRetailerLocationSchema ───

describe('updateRetailerLocationSchema', () => {
  it('should accept a single-field update', () => {
    const result = updateRetailerLocationSchema.safeParse({ label: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('should accept an isDefault flip on its own', () => {
    const result = updateRetailerLocationSchema.safeParse({ isDefault: true });
    expect(result.success).toBe(true);
  });

  it('should reject an empty body', () => {
    const result = updateRetailerLocationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty string for label', () => {
    const result = updateRetailerLocationSchema.safeParse({ label: '' });
    expect(result.success).toBe(false);
  });

  it('should accept null for nullable optional fields', () => {
    const result = updateRetailerLocationSchema.safeParse({
      contactName: null,
      contactPhone: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });
});
