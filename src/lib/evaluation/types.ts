/**
 * Evaluation Framework — Shared Types
 *
 * Central type definitions for the WholesaleHub evaluation system.
 * Covers search quality metrics, extraction accuracy metrics, policy
 * compliance metrics, evaluation run summaries, and comparison outputs.
 *
 * @module evaluation/types
 */

// ─── Base Metrics ───

/**
 * Base metrics shared across all evaluation types.
 * Every evaluator reports at minimum these standardised scores.
 */
export interface EvalMetricsBase {
  /** Overall accuracy (correct / total) */
  accuracy: number;
  /** Precision (true positives / (true positives + false positives)) */
  precision: number;
  /** Recall (true positives / (true positives + false negatives)) */
  recall: number;
  /** F1 score (harmonic mean of precision and recall) */
  f1Score: number;
  /** False positive rate (false positives / (false positives + true negatives)) */
  falsePositiveRate: number;
  /** False negative rate (false negatives / (false negatives + true positives)) */
  falseNegativeRate: number;
  /** Total number of test samples evaluated */
  totalSamples: number;
}

// ─── Search Evaluation ───

/**
 * A single test case for search evaluation.
 * Defines a query and the product IDs that *should* appear in results.
 */
export interface SearchEvalCase {
  /** The search query string (e.g. "disposable vape") */
  query: string;
  /** Product IDs (e.g. "PRD001") expected in the result set */
  expectedProductIds: string[];
  /** Optional: the product ID that should appear as the top result */
  expectedTopResult?: string;
}

/**
 * Metrics specific to search quality evaluation.
 * Extends the base metrics with information retrieval measures.
 */
export interface SearchEvalMetrics extends EvalMetricsBase {
  /** Mean Reciprocal Rank — average of 1/rank for the first relevant result */
  mrr: number;
  /** Recall at top-10 results — what fraction of expected results appear in top 10 */
  recallAt10: number;
  /** Per-query breakdown for detailed analysis */
  perQueryResults: SearchQueryResult[];
}

/**
 * Detailed result for a single search query evaluation.
 */
export interface SearchQueryResult {
  /** The query string that was tested */
  query: string;
  /** Product IDs expected in results */
  expectedProductIds: string[];
  /** Product IDs actually returned by search */
  actualProductIds: string[];
  /** Reciprocal rank (1 / position of first relevant result, 0 if not found) */
  reciprocalRank: number;
  /** Number of expected products found in results */
  hits: number;
  /** Number of expected products missing from results */
  misses: number;
  /** Number of unexpected products in results */
  falsePositives: number;
  /** Whether the expected top result was ranked first */
  topResultCorrect: boolean;
}

// ─── Extraction Evaluation ───

/**
 * A single test case for document extraction evaluation.
 * Pairs raw document text with the expected structured extraction output.
 */
export interface ExtractionEvalCase {
  /** Raw document text to extract from */
  documentText: string;
  /** Expected structured extraction matching ReceiptExtractionSchema */
  groundTruth: ExtractionGroundTruth;
}

/**
 * Ground truth shape for extraction evaluation.
 * Mirrors the ReceiptExtractionSchema from the validation-loop module.
 */
export interface ExtractionGroundTruth {
  supplier_name: string;
  document_type: 'INVOICE' | 'ASN' | 'PO_CONFIRMATION';
  document_number: string;
  po_reference?: string | null;
  ship_date?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  line_items: ExtractionLineItemGroundTruth[];
  subtotal: number;
  tax: number;
  total: number;
  confidence: {
    header: 'HIGH' | 'MEDIUM' | 'LOW';
    line_items: 'HIGH' | 'MEDIUM' | 'LOW';
    totals: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

/**
 * Ground truth for a single line item in the extraction.
 */
export interface ExtractionLineItemGroundTruth {
  sku?: string | null;
  upc?: string | null;
  product_description: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
}

/**
 * Metrics specific to extraction accuracy evaluation.
 * Extends base metrics with per-field and auto-accept analysis.
 */
export interface ExtractionEvalMetrics extends EvalMetricsBase {
  /** Per-field accuracy breakdown */
  perFieldAccuracy: Record<string, number>;
  /** % of HIGH confidence results that were actually correct */
  autoAcceptAccuracy: number;
  /** Average number of corrections needed per document */
  avgCorrectionsNeeded: number;
  /** % of fields successfully extracted (non-null) across all samples */
  completeness: number;
  /** Per-document breakdown for detailed analysis */
  perDocumentResults: ExtractionDocumentResult[];
}

/**
 * Detailed result for a single document extraction evaluation.
 */
export interface ExtractionDocumentResult {
  /** Index of the test case */
  caseIndex: number;
  /** Whether the overall extraction was correct */
  isCorrect: boolean;
  /** Per-field match results */
  fieldResults: Record<string, FieldMatchResult>;
  /** Number of extraction attempts / corrections needed */
  correctionsNeeded: number;
  /** Whether all confidence scores were HIGH (auto-accept candidate) */
  wasHighConfidence: boolean;
}

/**
 * Result of comparing a single field between expected and actual.
 */
export interface FieldMatchResult {
  /** The field name or path */
  field: string;
  /** Whether the field matched the ground truth */
  matched: boolean;
  /** Expected value */
  expected: unknown;
  /** Actual extracted value */
  actual: unknown;
}

// ─── Policy Evaluation ───

/**
 * A single test case for policy engine evaluation.
 * Defines a scenario with context and the expected policy decision.
 */
export interface PolicyEvalCase {
  /** Human-readable scenario description */
  scenario: string;
  /** Context to pass to the policy engine */
  context: PolicyTestContext;
  /** Whether the policy engine should allow this action */
  expectedAllowed: boolean;
  /** Policy IDs that should fire as violations */
  expectedViolations: string[];
}

/**
 * Context object for policy test cases.
 * Uses simplified shapes that can be cast to Prisma model types.
 */
export interface PolicyTestContext {
  /** The action being evaluated */
  action: 'ADD_TO_CART' | 'PLACE_ORDER' | 'LIST_PRODUCT';
  /** Simplified product data for testing */
  product?: {
    ageRestricted: boolean;
    minimumAge: number;
    restrictedStates: string[] | null;
    [key: string]: unknown;
  };
  /** Simplified user data for testing */
  user?: {
    ageVerified: boolean;
    [key: string]: unknown;
  };
  /** Simplified retailer data for testing */
  retailer?: {
    state: string | null;
    [key: string]: unknown;
  };
  /** Simplified pricing data for testing */
  pricing?: {
    minimumOrderQty: number;
    [key: string]: unknown;
  };
  /** Simplified wholesaler data for testing */
  wholesaler?: {
    licenseExpiry: Date | string | null;
    [key: string]: unknown;
  };
  /** Quantity being ordered */
  requestedQty?: number;
}

/**
 * Metrics specific to policy engine evaluation.
 * Extends base metrics with per-policy breakdown.
 */
export interface PolicyEvalMetrics extends EvalMetricsBase {
  /** Accuracy broken down by individual policy ID */
  perPolicyAccuracy: Record<string, number>;
  /** Number of scenarios where violations were correctly identified */
  correctBlocks: number;
  /** Number of scenarios where allows were correctly identified */
  correctAllows: number;
  /** Scenarios where a block should have happened but did not */
  missedBlocks: number;
  /** Scenarios where an allow should have happened but was blocked */
  falseBlocks: number;
  /** Per-scenario breakdown for detailed analysis */
  perScenarioResults: PolicyScenarioResult[];
}

/**
 * Detailed result for a single policy scenario evaluation.
 */
export interface PolicyScenarioResult {
  /** The scenario description */
  scenario: string;
  /** Whether the policy decision matched the expected outcome */
  isCorrect: boolean;
  /** Whether the policy engine allowed the action */
  actualAllowed: boolean;
  /** Whether the action was expected to be allowed */
  expectedAllowed: boolean;
  /** Policy IDs that actually fired as violations */
  actualViolations: string[];
  /** Policy IDs that were expected to fire as violations */
  expectedViolations: string[];
  /** Whether violation IDs matched exactly */
  violationsMatch: boolean;
}

// ─── Evaluation Run Summary ───

/**
 * Summary of an evaluation run, as stored in the database
 * and returned by the evaluation API.
 */
export interface EvaluationRunSummary {
  /** Unique run identifier */
  id: string;
  /** Human-readable run name */
  runName: string;
  /** Type of evaluation: search, extraction, or policy */
  type: 'search' | 'extraction' | 'policy';
  /** When the evaluation started */
  startedAt: Date;
  /** When the evaluation completed (null if still running) */
  completedAt: Date | null;
  /** Aggregate metrics for the run */
  metrics: SearchEvalMetrics | ExtractionEvalMetrics | PolicyEvalMetrics;
  /** Number of test samples evaluated */
  sampleCount: number;
}

/**
 * Comparison output between two evaluation runs.
 * Shows the delta for each metric.
 */
export interface EvaluationRunComparison {
  /** The older / baseline run */
  baselineRun: EvaluationRunSummary;
  /** The newer / candidate run */
  candidateRun: EvaluationRunSummary;
  /** Metric deltas (candidate - baseline). Positive = improvement. */
  deltas: Record<string, number>;
  /** Whether the candidate run is an overall improvement */
  isImprovement: boolean;
}
