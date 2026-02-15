import { logger } from '@/lib/logger';

// ─── Types ───

/** A single LLM invocation record with cost and performance data */
export interface LLMInvocation {
  /** Unique invocation identifier */
  id: string;
  /** Logical prompt name used for this invocation */
  promptName: string;
  /** Prompt version string */
  promptVersion: string;
  /** Model identifier (e.g. anthropic.claude-3-sonnet) */
  model: string;
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** End-to-end latency in milliseconds */
  latencyMs: number;
  /** Computed cost in USD */
  cost: number;
  /** Whether the invocation completed successfully */
  success: boolean;
  /** Error message if the invocation failed */
  error?: string;
  /** Arbitrary metadata attached to the invocation */
  metadata: Record<string, string | number | boolean>;
  /** ISO timestamp of the invocation */
  timestamp: string;
}

/** Aggregated statistics across invocations */
export interface InvocationStats {
  /** Total number of invocations */
  totalCalls: number;
  /** Total tokens consumed across all invocations */
  totalTokens: number;
  /** Total cost in USD */
  totalCost: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
  /** Success rate as a decimal (0-1) */
  successRate: number;
  /** Breakdown of stats per prompt name */
  byPrompt: Record<string, PromptInvocationStats>;
}

/** Per-prompt invocation statistics */
export interface PromptInvocationStats {
  promptName: string;
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  successRate: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

/** Time range filter for querying invocations */
export interface TimeRange {
  from: Date;
  to: Date;
}

// ─── Cost Model ───

/**
 * Pricing per million tokens (MTok) by model prefix.
 *
 * Claude Sonnet: $3/MTok input, $15/MTok output
 * Titan Embeddings: $0.02/MTok input (no output)
 */
interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'anthropic.claude': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'amazon.titan-embed': { inputPerMTok: 0.02, outputPerMTok: 0.0 },
};

/**
 * Calculate the USD cost for a given invocation based on its model and
 * token counts.
 *
 * @param model        - The model identifier string
 * @param inputTokens  - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateInvocationCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Find the matching pricing tier by prefix
  let pricing: ModelPricing | undefined;
  for (const [prefix, p] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(prefix)) {
      pricing = p;
      break;
    }
  }

  if (!pricing) {
    // Default to Claude pricing for unknown models
    pricing = MODEL_PRICING['anthropic.claude'];
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;

  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

// ─── Invocation Tracker ───

/**
 * In-memory LLM invocation tracker.
 *
 * Stores invocation records and provides aggregated statistics,
 * per-prompt breakdowns, and time-range filtering. Designed to be
 * periodically flushed to a database table (e.g. `llm_invocations`)
 * for long-term persistence and dashboard queries.
 */
export class InvocationTracker {
  /** In-memory store of invocation records */
  private invocations: LLMInvocation[] = [];

  /** Maximum number of records to keep in memory before requiring a flush */
  private readonly maxInMemory: number;

  constructor(maxInMemory: number = 10_000) {
    this.maxInMemory = maxInMemory;
  }

  /**
   * Record a new LLM invocation.
   *
   * If the cost field is zero or not provided, it will be auto-calculated
   * from the model and token counts.
   *
   * @param invocation - The invocation record to track
   */
  trackInvocation(invocation: LLMInvocation): void {
    // Auto-calculate cost if not provided
    const record: LLMInvocation = {
      ...invocation,
      cost:
        invocation.cost > 0
          ? invocation.cost
          : calculateInvocationCost(
              invocation.model,
              invocation.inputTokens,
              invocation.outputTokens,
            ),
    };

    this.invocations.push(record);

    // Evict oldest records if we exceed the in-memory limit
    if (this.invocations.length > this.maxInMemory) {
      const evicted = this.invocations.length - this.maxInMemory;
      this.invocations = this.invocations.slice(evicted);
      logger.warn({
        event: 'invocation_tracker_eviction',
        evictedCount: evicted,
        remaining: this.invocations.length,
      });
    }

    logger.debug({
      event: 'llm_invocation_tracked',
      id: record.id,
      promptName: record.promptName,
      model: record.model,
      tokens: record.totalTokens,
      cost: record.cost,
      latencyMs: record.latencyMs,
      success: record.success,
    });
  }

  /**
   * Get aggregated invocation statistics, optionally filtered by time range.
   *
   * @param timeRange - Optional date range filter
   * @returns Aggregated invocation stats with per-prompt breakdown
   */
  getInvocationStats(timeRange?: TimeRange): InvocationStats {
    const filtered = this.filterByTime(timeRange);

    if (filtered.length === 0) {
      return {
        totalCalls: 0,
        totalTokens: 0,
        totalCost: 0,
        avgLatencyMs: 0,
        successRate: 0,
        byPrompt: {},
      };
    }

    const totalCalls = filtered.length;
    const totalTokens = filtered.reduce((sum, inv) => sum + inv.totalTokens, 0);
    const totalCost = filtered.reduce((sum, inv) => sum + inv.cost, 0);
    const totalLatency = filtered.reduce((sum, inv) => sum + inv.latencyMs, 0);
    const successCount = filtered.filter((inv) => inv.success).length;

    // Build per-prompt breakdown
    const promptMap = new Map<string, LLMInvocation[]>();
    for (const inv of filtered) {
      const existing = promptMap.get(inv.promptName) ?? [];
      existing.push(inv);
      promptMap.set(inv.promptName, existing);
    }

    const byPrompt: Record<string, PromptInvocationStats> = {};
    for (const [promptName, invocations] of promptMap.entries()) {
      const pTotal = invocations.length;
      const pTokens = invocations.reduce((s, i) => s + i.totalTokens, 0);
      const pCost = invocations.reduce((s, i) => s + i.cost, 0);
      const pLatency = invocations.reduce((s, i) => s + i.latencyMs, 0);
      const pSuccess = invocations.filter((i) => i.success).length;
      const pInput = invocations.reduce((s, i) => s + i.inputTokens, 0);
      const pOutput = invocations.reduce((s, i) => s + i.outputTokens, 0);

      byPrompt[promptName] = {
        promptName,
        totalCalls: pTotal,
        totalTokens: pTokens,
        totalCost: Math.round(pCost * 1_000_000) / 1_000_000,
        avgLatencyMs: Math.round(pLatency / pTotal),
        successRate: pTotal > 0 ? pSuccess / pTotal : 0,
        avgInputTokens: Math.round(pInput / pTotal),
        avgOutputTokens: Math.round(pOutput / pTotal),
      };
    }

    return {
      totalCalls,
      totalTokens,
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
      avgLatencyMs: Math.round(totalLatency / totalCalls),
      successRate: totalCalls > 0 ? successCount / totalCalls : 0,
      byPrompt,
    };
  }

  /**
   * Retrieve all invocations for a specific prompt name.
   *
   * @param promptName - The logical prompt name to filter by
   * @returns Array of invocations sorted newest-first
   */
  getInvocationsByPrompt(promptName: string): LLMInvocation[] {
    return this.invocations
      .filter((inv) => inv.promptName === promptName)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
  }

  /**
   * Get the raw invocation records, optionally filtered by time range.
   * Useful for dashboard table views and exports.
   *
   * @param timeRange - Optional date range filter
   * @param limit     - Maximum number of records to return (default 100)
   * @returns Array of invocations sorted newest-first
   */
  getInvocations(timeRange?: TimeRange, limit: number = 100): LLMInvocation[] {
    const filtered = this.filterByTime(timeRange);
    return filtered
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, limit);
  }

  /**
   * Get the current number of in-memory records.
   */
  getRecordCount(): number {
    return this.invocations.length;
  }

  // ─── Private Helpers ───

  private filterByTime(timeRange?: TimeRange): LLMInvocation[] {
    if (!timeRange) {
      return this.invocations;
    }

    const fromMs = timeRange.from.getTime();
    const toMs = timeRange.to.getTime();

    return this.invocations.filter((inv) => {
      const ts = new Date(inv.timestamp).getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }
}

// ─── Singleton ───

let _trackerInstance: InvocationTracker | null = null;

/**
 * Returns the singleton InvocationTracker instance.
 * Initialized lazily on first access and persists for the process lifetime.
 */
export function getInvocationTracker(): InvocationTracker {
  if (!_trackerInstance) {
    _trackerInstance = new InvocationTracker();
    logger.info({ event: 'invocation_tracker_initialized' });
  }
  return _trackerInstance;
}
