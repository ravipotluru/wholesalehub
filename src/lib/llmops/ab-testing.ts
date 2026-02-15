import { logger } from '@/lib/logger';
import { getPromptRegistry } from './prompt-registry';

// ─── Types ───

/** Status of an A/B test */
export type ABTestStatus = 'RUNNING' | 'PAUSED' | 'COMPLETED';

/** Variant identifier */
export type VariantLabel = 'A' | 'B';

/** Outcome record for a single A/B test observation */
export interface ABTestOutcome {
  /** Which variant was served */
  variant: VariantLabel;
  /** Whether the invocation was considered a success */
  success: boolean;
  /** Arbitrary numeric metrics (e.g. latencyMs, confidence, f1Score) */
  metrics: Record<string, number>;
  /** ISO timestamp of the outcome */
  timestamp: string;
}

/** Aggregated metrics for one variant */
export interface VariantMetrics {
  variant: VariantLabel;
  promptVersion: string;
  totalObservations: number;
  successCount: number;
  successRate: number;
  /** Aggregated means of each recorded numeric metric */
  avgMetrics: Record<string, number>;
}

/** Results comparison for an A/B test */
export interface ABTestResults {
  testName: string;
  status: ABTestStatus;
  variantA: VariantMetrics;
  variantB: VariantMetrics;
  /** Which variant is currently leading, or null if too close to call */
  leadingVariant: VariantLabel | null;
  totalObservations: number;
}

/** Configuration for creating a new A/B test */
export interface ABTestConfig {
  /** Human-readable test name */
  name: string;
  /** Prompt name the test applies to */
  promptName: string;
  /** Prompt version for variant A */
  variantA: string;
  /** Prompt version for variant B */
  variantB: string;
  /** Fraction of traffic to route to variant B (0-1). Default 0.5 */
  trafficSplit?: number;
}

/** Full A/B test state */
export interface ABTest {
  /** Unique test identifier */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Prompt name the test applies to */
  promptName: string;
  /** Prompt version for variant A */
  variantA: string;
  /** Prompt version for variant B */
  variantB: string;
  /** Fraction of traffic routed to variant B (0-1) */
  trafficSplit: number;
  /** Current test status */
  status: ABTestStatus;
  /** ISO timestamp when the test started */
  startedAt: string;
  /** ISO timestamp when the test concluded (if completed) */
  completedAt: string | null;
  /** Winner variant (set when concluded) */
  winner: VariantLabel | null;
  /** Collected outcome records */
  outcomes: ABTestOutcome[];
}

// ─── A/B Testing Manager ───

/**
 * Manages A/B tests for LLM prompts.
 *
 * Supports creating tests between two prompt versions, deterministic
 * variant assignment based on request ID hashing, outcome recording,
 * and test conclusion with automatic prompt default promotion.
 */
export class ABTestManager {
  /** Active and completed tests keyed by test name */
  private tests: Map<string, ABTest> = new Map();

  /**
   * Create and start a new A/B test between two prompt versions.
   *
   * @param config - Test configuration
   * @returns The created ABTest
   */
  createABTest(config: ABTestConfig): ABTest {
    if (this.tests.has(config.name)) {
      throw new Error(`A/B test "${config.name}" already exists.`);
    }

    // Validate that both versions exist in the registry
    const registry = getPromptRegistry();
    const vA = registry.getPrompt(config.promptName, config.variantA);
    const vB = registry.getPrompt(config.promptName, config.variantB);

    if (!vA) {
      throw new Error(
        `Variant A version "${config.variantA}" not found for prompt "${config.promptName}".`,
      );
    }
    if (!vB) {
      throw new Error(
        `Variant B version "${config.variantB}" not found for prompt "${config.promptName}".`,
      );
    }

    const trafficSplit = config.trafficSplit ?? 0.5;
    if (trafficSplit < 0 || trafficSplit > 1) {
      throw new Error('Traffic split must be between 0 and 1.');
    }

    const test: ABTest = {
      id: `abtest_${config.name}_${Date.now()}`,
      name: config.name,
      promptName: config.promptName,
      variantA: config.variantA,
      variantB: config.variantB,
      trafficSplit,
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      completedAt: null,
      winner: null,
      outcomes: [],
    };

    this.tests.set(config.name, test);

    logger.info({
      event: 'ab_test_created',
      testName: test.name,
      promptName: test.promptName,
      variantA: test.variantA,
      variantB: test.variantB,
      trafficSplit,
    });

    return test;
  }

  /**
   * Get the variant assignment for a request, using deterministic hashing
   * so the same requestId always maps to the same variant.
   *
   * @param testName  - Name of the A/B test
   * @param requestId - Unique request identifier for deterministic assignment
   * @returns The assigned variant label and corresponding prompt version
   */
  getVariant(
    testName: string,
    requestId: string,
  ): { variant: VariantLabel; promptVersion: string } {
    const test = this.tests.get(testName);
    if (!test) {
      throw new Error(`A/B test "${testName}" not found.`);
    }

    if (test.status !== 'RUNNING') {
      // If the test is completed, always return the winner
      if (test.winner) {
        const version = test.winner === 'A' ? test.variantA : test.variantB;
        return { variant: test.winner, promptVersion: version };
      }
      // If paused with no winner, default to A
      return { variant: 'A', promptVersion: test.variantA };
    }

    // Deterministic hash: FNV-1a on the combined test name + request ID
    const hashInput = `${testName}:${requestId}`;
    const hashValue = fnv1aHash(hashInput);
    const normalizedHash = (hashValue % 10000) / 10000;

    const variant: VariantLabel = normalizedHash < test.trafficSplit ? 'B' : 'A';
    const promptVersion = variant === 'A' ? test.variantA : test.variantB;

    return { variant, promptVersion };
  }

  /**
   * Record an outcome observation for a variant in an A/B test.
   *
   * @param testName - Name of the A/B test
   * @param variant  - Which variant was served
   * @param success  - Whether the outcome was successful
   * @param metrics  - Arbitrary numeric metrics to record
   */
  recordOutcome(
    testName: string,
    variant: VariantLabel,
    success: boolean,
    metrics: Record<string, number>,
  ): void {
    const test = this.tests.get(testName);
    if (!test) {
      throw new Error(`A/B test "${testName}" not found.`);
    }

    if (test.status !== 'RUNNING') {
      logger.warn({
        event: 'ab_test_outcome_skipped',
        testName,
        reason: `Test status is ${test.status}`,
      });
      return;
    }

    const outcome: ABTestOutcome = {
      variant,
      success,
      metrics,
      timestamp: new Date().toISOString(),
    };

    test.outcomes.push(outcome);

    logger.debug({
      event: 'ab_test_outcome_recorded',
      testName,
      variant,
      success,
      metricKeys: Object.keys(metrics),
    });
  }

  /**
   * Get the current results and comparison for an A/B test.
   *
   * @param testName - Name of the A/B test
   * @returns Per-variant metrics comparison
   */
  getTestResults(testName: string): ABTestResults {
    const test = this.tests.get(testName);
    if (!test) {
      throw new Error(`A/B test "${testName}" not found.`);
    }

    const outcomesA = test.outcomes.filter((o) => o.variant === 'A');
    const outcomesB = test.outcomes.filter((o) => o.variant === 'B');

    const variantA = this.aggregateVariantMetrics('A', test.variantA, outcomesA);
    const variantB = this.aggregateVariantMetrics('B', test.variantB, outcomesB);

    // Determine leading variant: need at least 10 observations per variant
    let leadingVariant: VariantLabel | null = null;
    if (variantA.totalObservations >= 10 && variantB.totalObservations >= 10) {
      if (variantA.successRate > variantB.successRate + 0.02) {
        leadingVariant = 'A';
      } else if (variantB.successRate > variantA.successRate + 0.02) {
        leadingVariant = 'B';
      }
    }

    return {
      testName: test.name,
      status: test.status,
      variantA,
      variantB,
      leadingVariant,
      totalObservations: test.outcomes.length,
    };
  }

  /**
   * Conclude an A/B test by declaring a winner.
   * The winning variant's prompt version is set as the default in the
   * prompt registry.
   *
   * @param testName - Name of the A/B test
   * @param winner   - The winning variant
   */
  concludeTest(testName: string, winner: VariantLabel): void {
    const test = this.tests.get(testName);
    if (!test) {
      throw new Error(`A/B test "${testName}" not found.`);
    }

    if (test.status === 'COMPLETED') {
      throw new Error(`A/B test "${testName}" is already completed.`);
    }

    test.status = 'COMPLETED';
    test.completedAt = new Date().toISOString();
    test.winner = winner;

    // Promote the winner as the default prompt version
    const winnerVersion = winner === 'A' ? test.variantA : test.variantB;
    const registry = getPromptRegistry();

    try {
      registry.rollbackPrompt(test.promptName, winnerVersion);
    } catch (error) {
      logger.error({
        event: 'ab_test_promotion_failed',
        testName,
        winner,
        winnerVersion,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info({
      event: 'ab_test_concluded',
      testName,
      winner,
      winnerVersion,
      totalOutcomes: test.outcomes.length,
    });
  }

  /**
   * Pause a running A/B test. No new variant assignments will be made.
   *
   * @param testName - Name of the A/B test to pause
   */
  pauseTest(testName: string): void {
    const test = this.tests.get(testName);
    if (!test) {
      throw new Error(`A/B test "${testName}" not found.`);
    }

    if (test.status !== 'RUNNING') {
      throw new Error(`Cannot pause test with status "${test.status}".`);
    }

    test.status = 'PAUSED';
    logger.info({ event: 'ab_test_paused', testName });
  }

  /**
   * Resume a paused A/B test.
   *
   * @param testName - Name of the A/B test to resume
   */
  resumeTest(testName: string): void {
    const test = this.tests.get(testName);
    if (!test) {
      throw new Error(`A/B test "${testName}" not found.`);
    }

    if (test.status !== 'PAUSED') {
      throw new Error(`Cannot resume test with status "${test.status}".`);
    }

    test.status = 'RUNNING';
    logger.info({ event: 'ab_test_resumed', testName });
  }

  /**
   * List all A/B tests, optionally filtered by status.
   *
   * @param status - Optional status filter
   * @returns Array of ABTest records
   */
  listTests(status?: ABTestStatus): ABTest[] {
    const all = Array.from(this.tests.values());
    if (status) {
      return all.filter((t) => t.status === status);
    }
    return all;
  }

  // ─── Private Helpers ───

  private aggregateVariantMetrics(
    variant: VariantLabel,
    promptVersion: string,
    outcomes: ABTestOutcome[],
  ): VariantMetrics {
    const total = outcomes.length;

    if (total === 0) {
      return {
        variant,
        promptVersion,
        totalObservations: 0,
        successCount: 0,
        successRate: 0,
        avgMetrics: {},
      };
    }

    const successCount = outcomes.filter((o) => o.success).length;

    // Aggregate numeric metrics
    const metricSums = new Map<string, number>();
    const metricCounts = new Map<string, number>();

    for (const outcome of outcomes) {
      for (const [key, value] of Object.entries(outcome.metrics)) {
        metricSums.set(key, (metricSums.get(key) ?? 0) + value);
        metricCounts.set(key, (metricCounts.get(key) ?? 0) + 1);
      }
    }

    const avgMetrics: Record<string, number> = {};
    for (const [key, sum] of metricSums.entries()) {
      const count = metricCounts.get(key) ?? 1;
      avgMetrics[key] = Math.round((sum / count) * 1000) / 1000;
    }

    return {
      variant,
      promptVersion,
      totalObservations: total,
      successCount,
      successRate: Math.round((successCount / total) * 1000) / 1000,
      avgMetrics,
    };
  }
}

// ─── Hashing Utility ───

/**
 * FNV-1a 32-bit hash for deterministic variant assignment.
 * Produces a positive integer from a string input.
 *
 * @param input - String to hash
 * @returns Non-negative 32-bit integer
 */
function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime: 0x01000193
    hash = Math.imul(hash, 0x01000193);
  }

  // Ensure non-negative
  return hash >>> 0;
}

// ─── Singleton ───

let _abTestManagerInstance: ABTestManager | null = null;

/**
 * Returns the singleton ABTestManager instance.
 * Initialized lazily on first access and persists for the process lifetime.
 */
export function getABTestManager(): ABTestManager {
  if (!_abTestManagerInstance) {
    _abTestManagerInstance = new ABTestManager();
    logger.info({ event: 'ab_test_manager_initialized' });
  }
  return _abTestManagerInstance;
}
