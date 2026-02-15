/**
 * Policy Engine Tests
 *
 * Tests for src/lib/policies/index.ts — the declarative policy engine
 * that enforces age verification, state restrictions, MOQ, and license validation.
 */

import { evaluatePolicies } from '@/lib/policies';
import type { Product, ProductPricing, User, Retailer, Wholesaler } from '@prisma/client';

// ─── Test Fixtures ───

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Test Vape Pen',
    description: 'A test product',
    sku: 'VP-001',
    upc: '012345678901',
    categoryId: 'cat-1',
    brandId: 'brand-1',
    ageRestricted: false,
    minimumAge: null,
    restrictedStates: [],
    status: 'ACTIVE',
    imageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product;
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    passwordHash: 'hashed',
    role: 'RETAILER',
    ageVerified: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

function makeRetailer(overrides: Partial<Retailer> = {}): Retailer {
  return {
    id: 'retailer-1',
    userId: 'user-1',
    businessName: 'Quick Stop',
    storeType: 'GAS_STATION',
    state: 'TX',
    city: 'Houston',
    address: '123 Main St',
    zip: '77001',
    phone: '555-1234',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Retailer;
}

function makeWholesaler(overrides: Partial<Wholesaler> = {}): Wholesaler {
  return {
    id: 'wholesaler-1',
    userId: 'user-1',
    name: 'Big Dist Co',
    businessName: 'Big Dist Co',
    licenseNumber: 'LIC-12345',
    licenseState: 'TX',
    licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Wholesaler;
}

function makePricing(overrides: Partial<ProductPricing> = {}): ProductPricing {
  return {
    id: 'pricing-1',
    productId: 'prod-1',
    wholesalerId: 'wholesaler-1',
    wholesalePrice: 10.0,
    retailPrice: 15.0,
    minimumOrderQty: 10,
    stockQuantity: 100,
    stockStatus: 'IN_STOCK',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ProductPricing;
}

// ─── Tests ───

describe('Policy Engine — evaluatePolicies', () => {
  // ─── Age Verification ───

  describe('Age Verification Policy', () => {
    it('should allow non-age-restricted products regardless of user verification', async () => {
      const product = makeProduct({ ageRestricted: false });
      const user = makeUser({ ageVerified: false });

      const result = await evaluatePolicies('ADD_TO_CART', { product, user });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow age-restricted products when user is age-verified', async () => {
      const product = makeProduct({ ageRestricted: true, minimumAge: 21 });
      const user = makeUser({ ageVerified: true });

      const result = await evaluatePolicies('ADD_TO_CART', { product, user });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should block age-restricted products when user is NOT age-verified', async () => {
      const product = makeProduct({ ageRestricted: true, minimumAge: 21 });
      const user = makeUser({ ageVerified: false });

      const result = await evaluatePolicies('ADD_TO_CART', { product, user });

      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].policyId).toBe('AGE_VERIFICATION');
      expect(result.violations[0].reason).toContain('age 21+');
      expect(result.violations[0].evidence).toEqual({
        minimumAge: 21,
        userVerified: false,
      });
    });

    it('should include the minimum age in the violation reason', async () => {
      const product = makeProduct({ ageRestricted: true, minimumAge: 18 });
      const user = makeUser({ ageVerified: false });

      const result = await evaluatePolicies('PLACE_ORDER', { product, user });

      expect(result.violations[0].reason).toContain('age 18+');
    });
  });

  // ─── State Restriction ───

  describe('State Restriction Policy', () => {
    it('should allow products with no state restrictions', async () => {
      const product = makeProduct({ restrictedStates: [] });
      const retailer = makeRetailer({ state: 'TX' });

      const result = await evaluatePolicies('ADD_TO_CART', { product, retailer });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow when retailer state is NOT in restricted list', async () => {
      const product = makeProduct({ restrictedStates: ['CA', 'NY', 'IL'] });
      const retailer = makeRetailer({ state: 'TX' });

      const result = await evaluatePolicies('ADD_TO_CART', { product, retailer });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should block when retailer state IS in restricted list', async () => {
      const product = makeProduct({ restrictedStates: ['CA', 'NY', 'IL'] });
      const retailer = makeRetailer({ state: 'CA' });

      const result = await evaluatePolicies('ADD_TO_CART', { product, retailer });

      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].policyId).toBe('STATE_RESTRICTION');
      expect(result.violations[0].reason).toContain('CA');
    });

    it('should handle null restrictedStates gracefully', async () => {
      const product = makeProduct({ restrictedStates: null as unknown as string[] });
      const retailer = makeRetailer({ state: 'TX' });

      const result = await evaluatePolicies('ADD_TO_CART', { product, retailer });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should include evidence with restricted states and retailer state', async () => {
      const product = makeProduct({ restrictedStates: ['NY', 'NJ'] });
      const retailer = makeRetailer({ state: 'NY' });

      const result = await evaluatePolicies('PLACE_ORDER', { product, retailer });

      expect(result.violations[0].evidence).toEqual({
        restrictedStates: ['NY', 'NJ'],
        retailerState: 'NY',
      });
    });
  });

  // ─── MOQ Validation ───

  describe('MOQ (Minimum Order Quantity) Policy', () => {
    it('should allow when requested quantity meets MOQ', async () => {
      const pricing = makePricing({ minimumOrderQty: 10 });

      const result = await evaluatePolicies('ADD_TO_CART', {
        pricing,
        requestedQty: 10,
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow when requested quantity exceeds MOQ', async () => {
      const pricing = makePricing({ minimumOrderQty: 10 });

      const result = await evaluatePolicies('ADD_TO_CART', {
        pricing,
        requestedQty: 100,
      });

      expect(result.allowed).toBe(true);
    });

    it('should block when requested quantity is below MOQ', async () => {
      const pricing = makePricing({ minimumOrderQty: 24 });

      const result = await evaluatePolicies('ADD_TO_CART', {
        pricing,
        requestedQty: 5,
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].policyId).toBe('MINIMUM_ORDER_QTY');
      expect(result.violations[0].reason).toContain('24');
    });

    it('should include MOQ and requested quantity in evidence', async () => {
      const pricing = makePricing({ minimumOrderQty: 50 });

      const result = await evaluatePolicies('ADD_TO_CART', {
        pricing,
        requestedQty: 3,
      });

      expect(result.violations[0].evidence).toEqual({
        moq: 50,
        requested: 3,
      });
    });

    it('should block when quantity is 0', async () => {
      const pricing = makePricing({ minimumOrderQty: 1 });

      const result = await evaluatePolicies('PLACE_ORDER', {
        pricing,
        requestedQty: 0,
      });

      expect(result.allowed).toBe(false);
      expect(result.violations[0].policyId).toBe('MINIMUM_ORDER_QTY');
    });
  });

  // ─── License Validation ───

  describe('License Validation Policy', () => {
    it('should allow wholesaler with valid (future) license expiry', async () => {
      const wholesaler = makeWholesaler({
        licenseExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const result = await evaluatePolicies('ADD_TO_CART', { wholesaler });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow wholesaler with no license expiry (null)', async () => {
      const wholesaler = makeWholesaler({ licenseExpiry: null });

      const result = await evaluatePolicies('ADD_TO_CART', { wholesaler });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should block wholesaler with expired license', async () => {
      const wholesaler = makeWholesaler({
        licenseExpiry: new Date('2020-01-01'),
      });

      const result = await evaluatePolicies('ADD_TO_CART', { wholesaler });

      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].policyId).toBe('LICENSE_VALID');
      expect(result.violations[0].reason).toContain('expired');
    });

    it('should evaluate license for LIST_PRODUCT action', async () => {
      const wholesaler = makeWholesaler({
        licenseExpiry: new Date('2020-06-15'),
      });

      const result = await evaluatePolicies('LIST_PRODUCT', { wholesaler });

      expect(result.allowed).toBe(false);
      expect(result.violations[0].policyId).toBe('LICENSE_VALID');
    });

    it('should allow LIST_PRODUCT for wholesaler with valid license', async () => {
      const wholesaler = makeWholesaler({
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      const result = await evaluatePolicies('LIST_PRODUCT', { wholesaler });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  // ─── Multiple Policies Combined ───

  describe('Multiple policies applied together', () => {
    it('should pass all policies when everything is valid', async () => {
      const product = makeProduct({ ageRestricted: true, minimumAge: 21, restrictedStates: ['CA'] });
      const user = makeUser({ ageVerified: true });
      const retailer = makeRetailer({ state: 'TX' });
      const pricing = makePricing({ minimumOrderQty: 10 });
      const wholesaler = makeWholesaler({
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      const result = await evaluatePolicies('ADD_TO_CART', {
        product,
        user,
        retailer,
        pricing,
        wholesaler,
        requestedQty: 20,
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should collect multiple violations when several policies fail', async () => {
      const product = makeProduct({ ageRestricted: true, minimumAge: 21, restrictedStates: ['TX'] });
      const user = makeUser({ ageVerified: false });
      const retailer = makeRetailer({ state: 'TX' });
      const pricing = makePricing({ minimumOrderQty: 50 });
      const wholesaler = makeWholesaler({
        licenseExpiry: new Date('2019-01-01'),
      });

      const result = await evaluatePolicies('PLACE_ORDER', {
        product,
        user,
        retailer,
        pricing,
        wholesaler,
        requestedQty: 3,
      });

      expect(result.allowed).toBe(false);
      // Should have 4 violations: age, state, moq, license
      expect(result.violations.length).toBe(4);

      const policyIds = result.violations.map((v) => v.policyId);
      expect(policyIds).toContain('AGE_VERIFICATION');
      expect(policyIds).toContain('STATE_RESTRICTION');
      expect(policyIds).toContain('MINIMUM_ORDER_QTY');
      expect(policyIds).toContain('LICENSE_VALID');
    });

    it('should not evaluate ADD_TO_CART policies for LIST_PRODUCT action', async () => {
      const product = makeProduct({ ageRestricted: true, minimumAge: 21 });
      const user = makeUser({ ageVerified: false });
      const wholesaler = makeWholesaler({
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      const result = await evaluatePolicies('LIST_PRODUCT', {
        product,
        user,
        wholesaler,
      });

      // LIST_PRODUCT only checks license — age verification should NOT fire
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should skip policies for which context is missing', async () => {
      // Provide only product + user (no retailer, pricing, or wholesaler)
      const product = makeProduct({ ageRestricted: false });
      const user = makeUser();

      const result = await evaluatePolicies('ADD_TO_CART', { product, user });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should return empty violations when no context is provided', async () => {
      const result = await evaluatePolicies('ADD_TO_CART', {});

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });
});
