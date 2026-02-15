import type { Product, ProductPricing, User, Retailer, Wholesaler } from '@prisma/client';

interface PolicyResult {
  allowed: boolean;
  reason?: string;
  policyId: string;
  evidence?: Record<string, unknown>;
}

/** Age verification policy — ensures buyer is verified for age-restricted products */
const ageVerificationPolicy = {
  id: 'AGE_VERIFICATION',
  evaluate: (context: { product: Product; user: User }): PolicyResult => {
    if (!context.product.ageRestricted) {
      return { allowed: true, policyId: 'AGE_VERIFICATION' };
    }
    if (!context.user.ageVerified) {
      return {
        allowed: false,
        policyId: 'AGE_VERIFICATION',
        reason: `Product requires age ${context.product.minimumAge}+. User has not verified age.`,
        evidence: { minimumAge: context.product.minimumAge, userVerified: false },
      };
    }
    return { allowed: true, policyId: 'AGE_VERIFICATION' };
  },
};

/** State restriction policy — blocks sales in restricted states */
const stateRestrictionPolicy = {
  id: 'STATE_RESTRICTION',
  evaluate: (context: { product: Product; retailer: Retailer }): PolicyResult => {
    const restricted = (context.product.restrictedStates as string[]) || [];
    if (context.retailer.state && restricted.includes(context.retailer.state)) {
      return {
        allowed: false,
        policyId: 'STATE_RESTRICTION',
        reason: `Product cannot be sold in ${context.retailer.state}.`,
        evidence: { restrictedStates: restricted, retailerState: context.retailer.state },
      };
    }
    return { allowed: true, policyId: 'STATE_RESTRICTION' };
  },
};

/** MOQ policy — ensures minimum order quantities are met */
const moqPolicy = {
  id: 'MINIMUM_ORDER_QTY',
  evaluate: (context: { pricing: ProductPricing; requestedQty: number }): PolicyResult => {
    if (context.requestedQty < context.pricing.minimumOrderQty) {
      return {
        allowed: false,
        policyId: 'MINIMUM_ORDER_QTY',
        reason: `Minimum order is ${context.pricing.minimumOrderQty} units.`,
        evidence: { moq: context.pricing.minimumOrderQty, requested: context.requestedQty },
      };
    }
    return { allowed: true, policyId: 'MINIMUM_ORDER_QTY' };
  },
};

/** License validation policy — ensures supplier licenses are current */
const licensePolicy = {
  id: 'LICENSE_VALID',
  evaluate: (context: { wholesaler: Wholesaler }): PolicyResult => {
    if (context.wholesaler.licenseExpiry && new Date(context.wholesaler.licenseExpiry) < new Date()) {
      return {
        allowed: false,
        policyId: 'LICENSE_VALID',
        reason: `Supplier license expired on ${context.wholesaler.licenseExpiry}.`,
        evidence: { licenseExpiry: context.wholesaler.licenseExpiry },
      };
    }
    return { allowed: true, policyId: 'LICENSE_VALID' };
  },
};

type PolicyContext = {
  product?: Product;
  pricing?: ProductPricing;
  user?: User;
  retailer?: Retailer;
  wholesaler?: Wholesaler;
  requestedQty?: number;
};

/** Run all applicable policies for a given action */
export async function evaluatePolicies(
  action: 'ADD_TO_CART' | 'PLACE_ORDER' | 'LIST_PRODUCT',
  context: PolicyContext
): Promise<{ allowed: boolean; violations: PolicyResult[] }> {
  const results: PolicyResult[] = [];

  if (action === 'ADD_TO_CART' || action === 'PLACE_ORDER') {
    if (context.product && context.user) {
      results.push(ageVerificationPolicy.evaluate({ product: context.product, user: context.user }));
    }
    if (context.product && context.retailer) {
      results.push(stateRestrictionPolicy.evaluate({ product: context.product, retailer: context.retailer }));
    }
    if (context.pricing && context.requestedQty !== undefined) {
      results.push(moqPolicy.evaluate({ pricing: context.pricing, requestedQty: context.requestedQty }));
    }
    if (context.wholesaler) {
      results.push(licensePolicy.evaluate({ wholesaler: context.wholesaler }));
    }
  }

  if (action === 'LIST_PRODUCT') {
    if (context.wholesaler) {
      results.push(licensePolicy.evaluate({ wholesaler: context.wholesaler }));
    }
  }

  const violations = results.filter((r) => !r.allowed);

  return {
    allowed: violations.length === 0,
    violations,
  };
}
