/**
 * Policy Engine Evaluation Module
 *
 * Evaluates the WholesaleHub policy engine by running predefined test
 * scenarios and comparing the engine's allow/block decisions against
 * expected ground truth.
 *
 * Measures overall accuracy, per-policy accuracy, correct blocks,
 * correct allows, missed blocks, and false blocks.
 *
 * @module evaluation/policy-eval
 */

import { logger } from '@/lib/logger';
import { evaluatePolicies } from '@/lib/policies';
import type {
  PolicyEvalCase,
  PolicyEvalMetrics,
  PolicyScenarioResult,
  PolicyTestContext,
} from './types';

// ─── Main Evaluation Function ───

/**
 * Runs the full policy engine evaluation across all test cases.
 *
 * For each test case, invokes the policy engine with the provided context
 * and compares the decision (allowed/blocked + violation IDs) against
 * expected values.
 *
 * @param testCases - Array of policy evaluation test cases
 * @returns Aggregated policy evaluation metrics
 */
export async function evaluatePolicy(
  testCases: PolicyEvalCase[],
): Promise<PolicyEvalMetrics> {
  logger.info({
    event: 'policy_eval_start',
    totalCases: testCases.length,
  });

  const perScenarioResults: PolicyScenarioResult[] = [];
  const policyAccuracyCounters: Record<string, { correct: number; total: number }> = {};

  let totalCorrect = 0;
  let correctBlocks = 0;
  let correctAllows = 0;
  let missedBlocks = 0;
  let falseBlocks = 0;

  let totalTruePositives = 0;
  let totalFalsePositives = 0;
  let totalFalseNegatives = 0;

  for (const testCase of testCases) {
    // Build context for the policy engine
    const context = buildPolicyContext(testCase.context);

    // Run policy engine
    const result = await evaluatePolicies(
      testCase.context.action,
      context,
    );

    const actualAllowed = result.allowed;
    const actualViolations = result.violations.map((v) => v.policyId);

    // Check if the overall decision matches
    const decisionCorrect = actualAllowed === testCase.expectedAllowed;

    // Check if violations match exactly
    const expectedViolationSet = new Set(testCase.expectedViolations);
    const actualViolationSet = new Set(actualViolations);
    const violationsMatch =
      expectedViolationSet.size === actualViolationSet.size &&
      [...expectedViolationSet].every((v) => actualViolationSet.has(v));

    const isCorrect = decisionCorrect && violationsMatch;

    if (isCorrect) totalCorrect++;

    // Categorize the result
    if (!testCase.expectedAllowed && !actualAllowed) {
      correctBlocks++;
    } else if (testCase.expectedAllowed && actualAllowed) {
      correctAllows++;
    } else if (!testCase.expectedAllowed && actualAllowed) {
      missedBlocks++;
    } else if (testCase.expectedAllowed && !actualAllowed) {
      falseBlocks++;
    }

    // Precision/Recall: treat "block" as the positive class
    if (!testCase.expectedAllowed && !actualAllowed) {
      totalTruePositives++;
    } else if (testCase.expectedAllowed && !actualAllowed) {
      totalFalsePositives++;
    } else if (!testCase.expectedAllowed && actualAllowed) {
      totalFalseNegatives++;
    }

    // Per-policy accuracy tracking
    const allPolicyIds = new Set([
      ...testCase.expectedViolations,
      ...actualViolations,
    ]);
    for (const policyId of allPolicyIds) {
      if (!policyAccuracyCounters[policyId]) {
        policyAccuracyCounters[policyId] = { correct: 0, total: 0 };
      }
      policyAccuracyCounters[policyId].total++;
      const expectedFired = expectedViolationSet.has(policyId);
      const actualFired = actualViolationSet.has(policyId);
      if (expectedFired === actualFired) {
        policyAccuracyCounters[policyId].correct++;
      }
    }

    perScenarioResults.push({
      scenario: testCase.scenario,
      isCorrect,
      actualAllowed,
      expectedAllowed: testCase.expectedAllowed,
      actualViolations,
      expectedViolations: testCase.expectedViolations,
      violationsMatch,
    });
  }

  const totalSamples = testCases.length;
  const accuracy = totalSamples > 0 ? totalCorrect / totalSamples : 0;

  const precision =
    totalTruePositives + totalFalsePositives > 0
      ? totalTruePositives / (totalTruePositives + totalFalsePositives)
      : 0;

  const recall =
    totalTruePositives + totalFalseNegatives > 0
      ? totalTruePositives / (totalTruePositives + totalFalseNegatives)
      : 0;

  const f1Score =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  const falsePositiveRate =
    totalTruePositives + totalFalsePositives > 0
      ? totalFalsePositives / (totalTruePositives + totalFalsePositives)
      : 0;

  const falseNegativeRate =
    totalTruePositives + totalFalseNegatives > 0
      ? totalFalseNegatives / (totalTruePositives + totalFalseNegatives)
      : 0;

  // Per-policy accuracy
  const perPolicyAccuracy: Record<string, number> = {};
  for (const [policy, counter] of Object.entries(policyAccuracyCounters)) {
    perPolicyAccuracy[policy] =
      counter.total > 0 ? counter.correct / counter.total : 0;
  }

  const metrics: PolicyEvalMetrics = {
    accuracy,
    precision,
    recall,
    f1Score,
    falsePositiveRate,
    falseNegativeRate,
    totalSamples,
    perPolicyAccuracy,
    correctBlocks,
    correctAllows,
    missedBlocks,
    falseBlocks,
    perScenarioResults,
  };

  logger.info({
    event: 'policy_eval_complete',
    totalSamples,
    accuracy: Math.round(accuracy * 10000) / 10000,
    correctBlocks,
    correctAllows,
    missedBlocks,
    falseBlocks,
  });

  return metrics;
}

// ─── Context Builder ───

/**
 * Converts a PolicyTestContext into the shape expected by evaluatePolicies.
 * Casts simplified test objects to match Prisma model shapes.
 */
function buildPolicyContext(testContext: PolicyTestContext): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};

  if (testContext.product) {
    ctx.product = testContext.product;
  }
  if (testContext.user) {
    ctx.user = testContext.user;
  }
  if (testContext.retailer) {
    ctx.retailer = testContext.retailer;
  }
  if (testContext.pricing) {
    ctx.pricing = testContext.pricing;
  }
  if (testContext.wholesaler) {
    ctx.wholesaler = {
      ...testContext.wholesaler,
      licenseExpiry: testContext.wholesaler.licenseExpiry
        ? new Date(testContext.wholesaler.licenseExpiry as string)
        : null,
    };
  }
  if (testContext.requestedQty !== undefined) {
    ctx.requestedQty = testContext.requestedQty;
  }

  return ctx;
}

// ─── Default Test Cases ───

/**
 * Returns 12 hardcoded policy test cases covering age verification,
 * state restrictions, MOQ enforcement, and license validation.
 *
 * Scenarios include both expected-allow and expected-block cases for
 * each policy, plus multi-policy violation scenarios.
 *
 * @returns Array of 12 policy evaluation test cases
 */
export function getDefaultPolicyTestCases(): PolicyEvalCase[] {
  return [
    // ── Age Verification — Block ──
    {
      scenario: 'Age-restricted product, user not verified',
      context: {
        action: 'ADD_TO_CART',
        product: {
          ageRestricted: true,
          minimumAge: 21,
          restrictedStates: null,
        },
        user: { ageVerified: false },
      },
      expectedAllowed: false,
      expectedViolations: ['AGE_VERIFICATION'],
    },

    // ── Age Verification — Allow ──
    {
      scenario: 'Age-restricted product, user verified',
      context: {
        action: 'ADD_TO_CART',
        product: {
          ageRestricted: true,
          minimumAge: 21,
          restrictedStates: null,
        },
        user: { ageVerified: true },
      },
      expectedAllowed: true,
      expectedViolations: [],
    },

    // ── Age Verification — Non-restricted product, unverified user ──
    {
      scenario: 'Non-age-restricted product, user not verified',
      context: {
        action: 'ADD_TO_CART',
        product: {
          ageRestricted: false,
          minimumAge: 0,
          restrictedStates: null,
        },
        user: { ageVerified: false },
      },
      expectedAllowed: true,
      expectedViolations: [],
    },

    // ── State Restriction — Block ──
    {
      scenario: 'Product restricted in California, retailer in CA',
      context: {
        action: 'PLACE_ORDER',
        product: {
          ageRestricted: false,
          minimumAge: 0,
          restrictedStates: ['CA', 'NY', 'MA'],
        },
        user: { ageVerified: true },
        retailer: { state: 'CA' },
      },
      expectedAllowed: false,
      expectedViolations: ['STATE_RESTRICTION'],
    },

    // ── State Restriction — Allow ──
    {
      scenario: 'Product restricted in CA/NY, retailer in TX',
      context: {
        action: 'PLACE_ORDER',
        product: {
          ageRestricted: false,
          minimumAge: 0,
          restrictedStates: ['CA', 'NY'],
        },
        user: { ageVerified: true },
        retailer: { state: 'TX' },
      },
      expectedAllowed: true,
      expectedViolations: [],
    },

    // ── MOQ — Block ──
    {
      scenario: 'Order quantity below minimum (10 ordered, 25 required)',
      context: {
        action: 'ADD_TO_CART',
        product: {
          ageRestricted: false,
          minimumAge: 0,
          restrictedStates: null,
        },
        user: { ageVerified: true },
        pricing: { minimumOrderQty: 25 },
        requestedQty: 10,
      },
      expectedAllowed: false,
      expectedViolations: ['MINIMUM_ORDER_QTY'],
    },

    // ── MOQ — Allow ──
    {
      scenario: 'Order quantity meets minimum (50 ordered, 25 required)',
      context: {
        action: 'ADD_TO_CART',
        product: {
          ageRestricted: false,
          minimumAge: 0,
          restrictedStates: null,
        },
        user: { ageVerified: true },
        pricing: { minimumOrderQty: 25 },
        requestedQty: 50,
      },
      expectedAllowed: true,
      expectedViolations: [],
    },

    // ── License — Block (expired) ──
    {
      scenario: 'Wholesaler license expired',
      context: {
        action: 'LIST_PRODUCT',
        wholesaler: {
          licenseExpiry: '2023-01-01T00:00:00.000Z',
        },
      },
      expectedAllowed: false,
      expectedViolations: ['LICENSE_VALID'],
    },

    // ── License — Allow (valid) ──
    {
      scenario: 'Wholesaler license is valid (expires next year)',
      context: {
        action: 'LIST_PRODUCT',
        wholesaler: {
          licenseExpiry: '2027-12-31T00:00:00.000Z',
        },
      },
      expectedAllowed: true,
      expectedViolations: [],
    },

    // ── License — Allow (no expiry) ──
    {
      scenario: 'Wholesaler with no license expiry set',
      context: {
        action: 'LIST_PRODUCT',
        wholesaler: {
          licenseExpiry: null,
        },
      },
      expectedAllowed: true,
      expectedViolations: [],
    },

    // ── Multi-policy violation: age + state ──
    {
      scenario: 'Age-restricted product in restricted state, unverified user',
      context: {
        action: 'PLACE_ORDER',
        product: {
          ageRestricted: true,
          minimumAge: 21,
          restrictedStates: ['FL', 'GA'],
        },
        user: { ageVerified: false },
        retailer: { state: 'FL' },
      },
      expectedAllowed: false,
      expectedViolations: ['AGE_VERIFICATION', 'STATE_RESTRICTION'],
    },

    // ── Multi-policy violation: age + MOQ + license ──
    {
      scenario: 'Unverified user, below MOQ, expired license',
      context: {
        action: 'PLACE_ORDER',
        product: {
          ageRestricted: true,
          minimumAge: 21,
          restrictedStates: null,
        },
        user: { ageVerified: false },
        retailer: { state: 'TX' },
        pricing: { minimumOrderQty: 100 },
        requestedQty: 5,
        wholesaler: {
          licenseExpiry: '2022-06-01T00:00:00.000Z',
        },
      },
      expectedAllowed: false,
      expectedViolations: ['AGE_VERIFICATION', 'MINIMUM_ORDER_QTY', 'LICENSE_VALID'],
    },
  ];
}
