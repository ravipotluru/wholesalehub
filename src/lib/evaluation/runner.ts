/**
 * Evaluation Runner — Orchestrates all evaluation types
 *
 * Provides high-level entry points to run search, extraction, and policy
 * evaluations. Each function creates an EvaluationRunSummary with
 * aggregate metrics.
 *
 * @module evaluation/runner
 */

import { logger } from '@/lib/logger';
import { evaluateSearch, getDefaultSearchTestCases } from './search-eval';
import { evaluateExtraction, getDefaultExtractionTestCases } from './extraction-eval';
import { evaluatePolicy, getDefaultPolicyTestCases } from './policy-eval';
import type {
  EvaluationRunSummary,
  SearchEvalCase,
  ExtractionEvalCase,
  PolicyEvalCase,
  SearchEvalMetrics,
  ExtractionEvalMetrics,
  PolicyEvalMetrics,
} from './types';

// ─── ID Generator ───

/**
 * Generates a unique evaluation run ID.
 *
 * @param prefix - Short prefix for the run type
 * @returns A unique string ID
 */
function generateRunId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `eval_${prefix}_${timestamp}_${random}`;
}

// ─── Search Evaluation Runner ───

/**
 * Runs a search quality evaluation.
 *
 * Executes the search evaluator against either the provided test cases
 * or the built-in default set of 25 test queries. Returns an
 * EvaluationRunSummary containing SearchEvalMetrics.
 *
 * @param testCases - Optional custom test cases; defaults to built-in set
 * @returns Evaluation run summary with search metrics
 */
export async function runSearchEval(
  testCases?: SearchEvalCase[],
): Promise<EvaluationRunSummary> {
  const cases = testCases ?? getDefaultSearchTestCases();
  const runId = generateRunId('search');
  const startedAt = new Date();

  logger.info({
    event: 'eval_runner_search_start',
    runId,
    caseCount: cases.length,
  });

  const metrics: SearchEvalMetrics = await evaluateSearch(cases);

  const summary: EvaluationRunSummary = {
    id: runId,
    runName: `Search Eval — ${startedAt.toISOString().slice(0, 10)}`,
    type: 'search',
    startedAt,
    completedAt: new Date(),
    metrics,
    sampleCount: cases.length,
  };

  logger.info({
    event: 'eval_runner_search_complete',
    runId,
    accuracy: metrics.accuracy,
    f1Score: metrics.f1Score,
    mrr: metrics.mrr,
  });

  return summary;
}

// ─── Extraction Evaluation Runner ───

/**
 * Runs an extraction accuracy evaluation.
 *
 * Executes the extraction evaluator against either the provided test cases
 * or the built-in default set of 12 document test cases. Returns an
 * EvaluationRunSummary containing ExtractionEvalMetrics.
 *
 * @param testCases - Optional custom test cases; defaults to built-in set
 * @returns Evaluation run summary with extraction metrics
 */
export async function runExtractionEval(
  testCases?: ExtractionEvalCase[],
): Promise<EvaluationRunSummary> {
  const cases = testCases ?? getDefaultExtractionTestCases();
  const runId = generateRunId('extraction');
  const startedAt = new Date();

  logger.info({
    event: 'eval_runner_extraction_start',
    runId,
    caseCount: cases.length,
  });

  const metrics: ExtractionEvalMetrics = await evaluateExtraction(cases);

  const summary: EvaluationRunSummary = {
    id: runId,
    runName: `Extraction Eval — ${startedAt.toISOString().slice(0, 10)}`,
    type: 'extraction',
    startedAt,
    completedAt: new Date(),
    metrics,
    sampleCount: cases.length,
  };

  logger.info({
    event: 'eval_runner_extraction_complete',
    runId,
    accuracy: metrics.accuracy,
    f1Score: metrics.f1Score,
    autoAcceptAccuracy: metrics.autoAcceptAccuracy,
  });

  return summary;
}

// ─── Policy Evaluation Runner ───

/**
 * Runs a policy engine evaluation.
 *
 * Executes the policy evaluator against either the provided test cases
 * or the built-in default set of 12 policy scenarios. Returns an
 * EvaluationRunSummary containing PolicyEvalMetrics.
 *
 * @param testCases - Optional custom test cases; defaults to built-in set
 * @returns Evaluation run summary with policy metrics
 */
export async function runPolicyEval(
  testCases?: PolicyEvalCase[],
): Promise<EvaluationRunSummary> {
  const cases = testCases ?? getDefaultPolicyTestCases();
  const runId = generateRunId('policy');
  const startedAt = new Date();

  logger.info({
    event: 'eval_runner_policy_start',
    runId,
    caseCount: cases.length,
  });

  const metrics: PolicyEvalMetrics = await evaluatePolicy(cases);

  const summary: EvaluationRunSummary = {
    id: runId,
    runName: `Policy Eval — ${startedAt.toISOString().slice(0, 10)}`,
    type: 'policy',
    startedAt,
    completedAt: new Date(),
    metrics,
    sampleCount: cases.length,
  };

  logger.info({
    event: 'eval_runner_policy_complete',
    runId,
    accuracy: metrics.accuracy,
    correctBlocks: metrics.correctBlocks,
    correctAllows: metrics.correctAllows,
    missedBlocks: metrics.missedBlocks,
    falseBlocks: metrics.falseBlocks,
  });

  return summary;
}

// ─── Run All Evaluations ───

/**
 * Runs all three evaluation types sequentially and returns their summaries.
 *
 * Executes search, extraction, and policy evaluations in order.
 * If any single evaluation fails, the error is logged and skipped
 * so that remaining evaluations can still complete.
 *
 * @returns Array of evaluation run summaries (1-3 items)
 */
export async function runAllEvals(): Promise<EvaluationRunSummary[]> {
  logger.info({ event: 'eval_runner_all_start' });

  const results: EvaluationRunSummary[] = [];

  // Search
  try {
    const searchResult = await runSearchEval();
    results.push(searchResult);
  } catch (error) {
    logger.error({
      event: 'eval_runner_search_error',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Extraction
  try {
    const extractionResult = await runExtractionEval();
    results.push(extractionResult);
  } catch (error) {
    logger.error({
      event: 'eval_runner_extraction_error',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Policy
  try {
    const policyResult = await runPolicyEval();
    results.push(policyResult);
  } catch (error) {
    logger.error({
      event: 'eval_runner_policy_error',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info({
    event: 'eval_runner_all_complete',
    completedCount: results.length,
  });

  return results;
}
