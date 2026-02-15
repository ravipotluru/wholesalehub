import { logger } from '@/lib/logger';

// ─── Types ───

/** Configuration for a tunable threshold */
export interface ThresholdConfig {
  /** Metric name this threshold applies to (e.g. "anomaly_zscore") */
  metricName: string;
  /** Current threshold value */
  currentValue: number;
  /** Minimum allowed threshold value */
  minValue: number;
  /** Maximum allowed threshold value */
  maxValue: number;
  /** ISO timestamp of the last tuning adjustment */
  lastTuned: string;
  /** Current false positive rate (0-1) */
  falsePositiveRate: number;
  /** Current false negative rate (0-1) */
  falseNegativeRate: number;
}

/** A false positive or false negative record */
interface FeedbackRecord {
  /** Metric this feedback applies to */
  metricName: string;
  /** Entity that triggered the detection */
  entityId: string;
  /** Whether this is a false positive or false negative */
  type: 'FP' | 'FN';
  /** ISO timestamp of the feedback */
  timestamp: string;
}

/** Result of a threshold tuning cycle */
export interface TuningResult {
  metricName: string;
  previousValue: number;
  newValue: number;
  adjustment: number;
  reason: string;
  falsePositiveRate: number;
  falseNegativeRate: number;
}

/** Summary of all threshold states */
export interface ThresholdSummary {
  thresholds: ThresholdConfig[];
  lastTuningResults: TuningResult[];
  totalFeedbackRecords: number;
}

// ─── Constants ───

/** Maximum adjustment per tuning cycle as a fraction of the current value */
const MAX_ADJUSTMENT_FRACTION = 0.10;

/** FP rate threshold above which we increase the threshold (less sensitive) */
const FP_RATE_THRESHOLD = 0.20;

/** FN rate threshold above which we decrease the threshold (more sensitive) */
const FN_RATE_THRESHOLD = 0.10;

/** Number of recent feedback records used to calculate rates */
const FEEDBACK_WINDOW_SIZE = 100;

// ─── Threshold Tuner ───

/**
 * Automatic threshold tuner based on false positive / false negative feedback.
 *
 * Tracks FP/FN feedback for each metric, calculates error rates, and
 * automatically adjusts thresholds:
 * - If FP rate > 20%: increase threshold (less sensitive, fewer false alarms)
 * - If FN rate > 10%: decrease threshold (more sensitive, fewer missed detections)
 * - Adjustments are gradual (max 10% change per tuning cycle)
 *
 * Pre-configured with thresholds for anomaly z-score, extraction confidence,
 * and search relevance scoring.
 */
export class ThresholdTuner {
  /** Threshold configurations keyed by metric name */
  private thresholds: Map<string, ThresholdConfig> = new Map();

  /** Feedback records for rate calculation */
  private feedbackRecords: FeedbackRecord[] = [];

  /** Most recent tuning results */
  private lastTuningResults: TuningResult[] = [];

  constructor() {
    // Pre-configure default thresholds
    this.initializeDefaults();
  }

  /**
   * Record a false positive detection for a metric.
   * A false positive means the system flagged something that should not
   * have been flagged.
   *
   * @param metricName - The metric the FP applies to
   * @param entityId   - The entity that was incorrectly flagged
   */
  recordFalsePositive(metricName: string, entityId: string): void {
    this.recordFeedback(metricName, entityId, 'FP');
  }

  /**
   * Record a false negative for a metric.
   * A false negative means the system missed something that should
   * have been flagged.
   *
   * @param metricName - The metric the FN applies to
   * @param entityId   - The entity that was missed
   */
  recordFalseNegative(metricName: string, entityId: string): void {
    this.recordFeedback(metricName, entityId, 'FN');
  }

  /**
   * Run a tuning cycle across all configured thresholds.
   *
   * For each metric:
   * 1. Calculate FP and FN rates from recent feedback
   * 2. If FP rate > 20%, increase threshold (less sensitive)
   * 3. If FN rate > 10%, decrease threshold (more sensitive)
   * 4. Clamp adjustments to max 10% and respect min/max bounds
   *
   * @returns Array of tuning results describing what changed
   */
  tuneThresholds(): TuningResult[] {
    const results: TuningResult[] = [];

    for (const [metricName, config] of this.thresholds.entries()) {
      const recentFeedback = this.getRecentFeedback(metricName);

      if (recentFeedback.length === 0) {
        // No feedback yet, skip tuning
        continue;
      }

      const fpCount = recentFeedback.filter((f) => f.type === 'FP').length;
      const fnCount = recentFeedback.filter((f) => f.type === 'FN').length;
      const total = recentFeedback.length;

      const fpRate = total > 0 ? fpCount / total : 0;
      const fnRate = total > 0 ? fnCount / total : 0;

      // Update rates on the config
      config.falsePositiveRate = Math.round(fpRate * 1000) / 1000;
      config.falseNegativeRate = Math.round(fnRate * 1000) / 1000;

      const previousValue = config.currentValue;
      let adjustment = 0;
      let reason = 'No adjustment needed';

      if (fpRate > FP_RATE_THRESHOLD) {
        // Too many false positives: increase threshold (less sensitive)
        const rawAdjustment = config.currentValue * MAX_ADJUSTMENT_FRACTION;
        // Scale adjustment by how far over the threshold we are
        const overshootFactor = Math.min(
          (fpRate - FP_RATE_THRESHOLD) / FP_RATE_THRESHOLD,
          1.0,
        );
        adjustment = rawAdjustment * (0.5 + 0.5 * overshootFactor);
        reason = `FP rate ${(fpRate * 100).toFixed(1)}% exceeds ${(FP_RATE_THRESHOLD * 100).toFixed(0)}% threshold. Increasing threshold to reduce false alarms.`;
      } else if (fnRate > FN_RATE_THRESHOLD) {
        // Too many false negatives: decrease threshold (more sensitive)
        const rawAdjustment = config.currentValue * MAX_ADJUSTMENT_FRACTION;
        const overshootFactor = Math.min(
          (fnRate - FN_RATE_THRESHOLD) / FN_RATE_THRESHOLD,
          1.0,
        );
        adjustment = -(rawAdjustment * (0.5 + 0.5 * overshootFactor));
        reason = `FN rate ${(fnRate * 100).toFixed(1)}% exceeds ${(FN_RATE_THRESHOLD * 100).toFixed(0)}% threshold. Decreasing threshold to catch more true positives.`;
      }

      if (adjustment !== 0) {
        // Apply adjustment with bounds clamping
        const newValue = clamp(
          config.currentValue + adjustment,
          config.minValue,
          config.maxValue,
        );

        // Only record if the value actually changed after clamping
        if (newValue !== config.currentValue) {
          config.currentValue = Math.round(newValue * 10000) / 10000;
          config.lastTuned = new Date().toISOString();

          logger.info({
            event: 'threshold_tuned',
            metricName,
            previousValue,
            newValue: config.currentValue,
            adjustment: Math.round(adjustment * 10000) / 10000,
            fpRate: config.falsePositiveRate,
            fnRate: config.falseNegativeRate,
          });
        }
      }

      results.push({
        metricName,
        previousValue,
        newValue: config.currentValue,
        adjustment: Math.round((config.currentValue - previousValue) * 10000) / 10000,
        reason,
        falsePositiveRate: config.falsePositiveRate,
        falseNegativeRate: config.falseNegativeRate,
      });
    }

    this.lastTuningResults = results;
    return results;
  }

  /**
   * Get the current configuration for a specific threshold.
   *
   * @param metricName - The metric name
   * @returns The threshold configuration, or null if not found
   */
  getThreshold(metricName: string): ThresholdConfig | null {
    return this.thresholds.get(metricName) ?? null;
  }

  /**
   * Get all threshold configurations.
   *
   * @returns Array of all threshold configs
   */
  getAllThresholds(): ThresholdConfig[] {
    return Array.from(this.thresholds.values());
  }

  /**
   * Manually set a threshold value, bypassing the automatic tuning logic.
   *
   * @param metricName - The metric to adjust
   * @param value      - The new threshold value
   */
  setThreshold(metricName: string, value: number): void {
    const config = this.thresholds.get(metricName);
    if (!config) {
      throw new Error(`Threshold for metric "${metricName}" not found.`);
    }

    const clamped = clamp(value, config.minValue, config.maxValue);

    logger.info({
      event: 'threshold_manual_set',
      metricName,
      previousValue: config.currentValue,
      newValue: clamped,
    });

    config.currentValue = clamped;
    config.lastTuned = new Date().toISOString();
  }

  /**
   * Get a summary of all thresholds, last tuning results, and feedback volume.
   *
   * @returns Comprehensive threshold summary
   */
  getSummary(): ThresholdSummary {
    return {
      thresholds: this.getAllThresholds(),
      lastTuningResults: this.lastTuningResults,
      totalFeedbackRecords: this.feedbackRecords.length,
    };
  }

  /**
   * Get all feedback records for a specific metric.
   *
   * @param metricName - Optional metric filter
   * @returns Array of feedback records
   */
  getFeedbackRecords(metricName?: string): FeedbackRecord[] {
    if (metricName) {
      return this.feedbackRecords.filter((f) => f.metricName === metricName);
    }
    return [...this.feedbackRecords];
  }

  // ─── Private Helpers ───

  private recordFeedback(
    metricName: string,
    entityId: string,
    type: 'FP' | 'FN',
  ): void {
    const config = this.thresholds.get(metricName);
    if (!config) {
      logger.warn({
        event: 'threshold_feedback_unknown_metric',
        metricName,
        type,
        entityId,
      });
      // Still record it so we don't lose feedback data
    }

    this.feedbackRecords.push({
      metricName,
      entityId,
      type,
      timestamp: new Date().toISOString(),
    });

    logger.debug({
      event: 'threshold_feedback_recorded',
      metricName,
      entityId,
      type,
      totalRecords: this.feedbackRecords.length,
    });
  }

  private getRecentFeedback(metricName: string): FeedbackRecord[] {
    return this.feedbackRecords
      .filter((f) => f.metricName === metricName)
      .slice(-FEEDBACK_WINDOW_SIZE);
  }

  private initializeDefaults(): void {
    const defaults: ThresholdConfig[] = [
      {
        metricName: 'anomaly_zscore',
        currentValue: 2.5,
        minValue: 1.5,
        maxValue: 4.0,
        lastTuned: new Date().toISOString(),
        falsePositiveRate: 0,
        falseNegativeRate: 0,
      },
      {
        metricName: 'extraction_confidence',
        currentValue: 0.7,
        minValue: 0.3,
        maxValue: 0.95,
        lastTuned: new Date().toISOString(),
        falsePositiveRate: 0,
        falseNegativeRate: 0,
      },
      {
        metricName: 'search_relevance_score',
        currentValue: 0.5,
        minValue: 0.1,
        maxValue: 0.9,
        lastTuned: new Date().toISOString(),
        falsePositiveRate: 0,
        falseNegativeRate: 0,
      },
    ];

    for (const config of defaults) {
      this.thresholds.set(config.metricName, config);
    }

    logger.info({
      event: 'threshold_tuner_initialized',
      thresholdCount: defaults.length,
      metrics: defaults.map((d) => d.metricName),
    });
  }
}

// ─── Utility ───

/**
 * Clamp a value between a minimum and maximum bound.
 *
 * @param value - The value to clamp
 * @param min   - Minimum bound
 * @param max   - Maximum bound
 * @returns The clamped value
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Singleton ───

let _thresholdTunerInstance: ThresholdTuner | null = null;

/**
 * Returns the singleton ThresholdTuner instance.
 * Initialized lazily on first access with default thresholds for
 * anomaly z-score, extraction confidence, and search relevance.
 */
export function getThresholdTuner(): ThresholdTuner {
  if (!_thresholdTunerInstance) {
    _thresholdTunerInstance = new ThresholdTuner();
  }
  return _thresholdTunerInstance;
}
