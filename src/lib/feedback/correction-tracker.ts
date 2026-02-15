import { logger } from '@/lib/logger';

// ─── Types ───

/** The type of entity that was corrected */
export type CorrectionEntityType = 'EXTRACTION' | 'SEARCH' | 'ANOMALY';

/** The nature of the feedback / correction */
export type FeedbackType =
  | 'FALSE_POSITIVE'
  | 'FALSE_NEGATIVE'
  | 'WRONG_VALUE'
  | 'MISSING_VALUE';

/** A single human correction record */
export interface CorrectionRecord {
  /** Unique correction identifier */
  id: string;
  /** What type of system output was corrected */
  entityType: CorrectionEntityType;
  /** ID of the entity that was corrected (e.g. extraction ID, search result ID) */
  entityId: string;
  /** The specific field that was corrected */
  fieldName: string;
  /** The original value produced by the system */
  originalValue: string;
  /** The corrected value provided by the human */
  correctedValue: string;
  /** User ID of the person who made the correction */
  correctedBy: string;
  /** ISO timestamp of the correction */
  correctedAt: string;
  /** Nature of the correction */
  feedbackType: FeedbackType;
}

/** Input for recording a new correction (id and correctedAt auto-generated) */
export interface CorrectionInput {
  entityType: CorrectionEntityType;
  entityId: string;
  fieldName: string;
  originalValue: string;
  correctedValue: string;
  correctedBy: string;
  feedbackType: FeedbackType;
}

/** A few-shot example generated from correction history */
export interface FewShotExample {
  /** Human-readable label for the example */
  label: string;
  /** The input that produced the incorrect output */
  input: string;
  /** The correct output (as corrected by the human) */
  expectedOutput: string;
  /** The incorrect output originally produced */
  incorrectOutput: string;
}

/** Statistics about corrections */
export interface CorrectionStats {
  /** Total number of corrections recorded */
  totalCorrections: number;
  /** Correction counts grouped by entity type */
  byEntityType: Record<CorrectionEntityType, number>;
  /** Correction counts grouped by feedback type */
  byFeedbackType: Record<FeedbackType, number>;
  /** Most frequently corrected fields sorted by count descending */
  mostCorrectedFields: Array<{ fieldName: string; count: number }>;
  /** Corrections per day for the last 30 days */
  dailyTrend: Array<{ date: string; count: number }>;
}

// ─── Correction Tracker ───

/**
 * Tracks human corrections to LLM-generated outputs.
 *
 * Records corrections, generates few-shot examples from correction history
 * for prompt enhancement, and provides statistics for monitoring correction
 * rates and identifying systematically weak areas.
 *
 * Designed to persist to a database table (e.g. `correction_records`)
 * with the in-memory store serving as a write-through cache.
 */
export class CorrectionTracker {
  /** In-memory store of correction records */
  private corrections: CorrectionRecord[] = [];

  /**
   * Record a new human correction.
   *
   * @param input - The correction details
   * @returns The created CorrectionRecord with generated id and timestamp
   */
  recordCorrection(input: CorrectionInput): CorrectionRecord {
    const record: CorrectionRecord = {
      id: `corr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      entityType: input.entityType,
      entityId: input.entityId,
      fieldName: input.fieldName,
      originalValue: input.originalValue,
      correctedValue: input.correctedValue,
      correctedBy: input.correctedBy,
      correctedAt: new Date().toISOString(),
      feedbackType: input.feedbackType,
    };

    this.corrections.push(record);

    logger.info({
      event: 'correction_recorded',
      id: record.id,
      entityType: record.entityType,
      entityId: record.entityId,
      fieldName: record.fieldName,
      feedbackType: record.feedbackType,
    });

    return record;
  }

  /**
   * Retrieve recent corrections, optionally filtered by entity type.
   *
   * @param entityType - Optional filter by entity type
   * @param limit      - Maximum number of records to return (default 50)
   * @returns Array of correction records sorted newest-first
   */
  getCorrections(
    entityType?: CorrectionEntityType,
    limit: number = 50,
  ): CorrectionRecord[] {
    let filtered = this.corrections;

    if (entityType) {
      filtered = filtered.filter((c) => c.entityType === entityType);
    }

    return filtered
      .sort(
        (a, b) =>
          new Date(b.correctedAt).getTime() - new Date(a.correctedAt).getTime(),
      )
      .slice(0, limit);
  }

  /**
   * Generate few-shot examples from recent corrections for prompt enhancement.
   *
   * Converts human corrections into input/expected-output pairs that can be
   * injected into prompt templates to improve LLM accuracy via in-context
   * learning. Focuses on WRONG_VALUE and MISSING_VALUE corrections as these
   * provide the most direct training signal.
   *
   * @param entityType - Filter corrections by entity type
   * @param limit      - Maximum number of examples to generate (default 5)
   * @returns Array of few-shot examples formatted for prompt injection
   */
  generateFewShotExamples(
    entityType: CorrectionEntityType,
    limit: number = 5,
  ): FewShotExample[] {
    const relevant = this.corrections
      .filter(
        (c) =>
          c.entityType === entityType &&
          (c.feedbackType === 'WRONG_VALUE' || c.feedbackType === 'MISSING_VALUE'),
      )
      .sort(
        (a, b) =>
          new Date(b.correctedAt).getTime() - new Date(a.correctedAt).getTime(),
      )
      .slice(0, limit);

    return relevant.map((correction) => ({
      label: `${correction.entityType} correction for field "${correction.fieldName}"`,
      input: `Entity: ${correction.entityId}, Field: ${correction.fieldName}`,
      expectedOutput: correction.correctedValue,
      incorrectOutput: correction.originalValue,
    }));
  }

  /**
   * Build a formatted few-shot examples string suitable for injection
   * into a prompt template's {{fewShotExamples}} placeholder.
   *
   * @param entityType - Filter corrections by entity type
   * @param limit      - Maximum number of examples (default 3)
   * @returns Formatted string of few-shot examples, or empty string if none
   */
  buildFewShotPromptSection(
    entityType: CorrectionEntityType,
    limit: number = 3,
  ): string {
    const examples = this.generateFewShotExamples(entityType, limit);

    if (examples.length === 0) {
      return '';
    }

    const lines: string[] = [
      'Here are examples of previous corrections to guide your output:',
      '',
    ];

    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i];
      lines.push(`Example ${i + 1}: ${ex.label}`);
      lines.push(`  Incorrect: ${ex.incorrectOutput}`);
      lines.push(`  Correct:   ${ex.expectedOutput}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get comprehensive correction statistics.
   *
   * @returns Aggregated correction stats including breakdowns and trends
   */
  getCorrectionStats(): CorrectionStats {
    const total = this.corrections.length;

    // By entity type
    const byEntityType: Record<CorrectionEntityType, number> = {
      EXTRACTION: 0,
      SEARCH: 0,
      ANOMALY: 0,
    };
    for (const c of this.corrections) {
      byEntityType[c.entityType]++;
    }

    // By feedback type
    const byFeedbackType: Record<FeedbackType, number> = {
      FALSE_POSITIVE: 0,
      FALSE_NEGATIVE: 0,
      WRONG_VALUE: 0,
      MISSING_VALUE: 0,
    };
    for (const c of this.corrections) {
      byFeedbackType[c.feedbackType]++;
    }

    // Most corrected fields
    const fieldCounts = new Map<string, number>();
    for (const c of this.corrections) {
      fieldCounts.set(c.fieldName, (fieldCounts.get(c.fieldName) ?? 0) + 1);
    }
    const mostCorrectedFields = Array.from(fieldCounts.entries())
      .map(([fieldName, count]) => ({ fieldName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Daily trend for last 30 days
    const dailyTrend = this.buildDailyTrend(30);

    return {
      totalCorrections: total,
      byEntityType,
      byFeedbackType,
      mostCorrectedFields,
      dailyTrend,
    };
  }

  /**
   * Get the current number of stored corrections.
   */
  getRecordCount(): number {
    return this.corrections.length;
  }

  // ─── Private Helpers ───

  private buildDailyTrend(days: number): Array<{ date: string; count: number }> {
    const trend: Array<{ date: string; count: number }> = [];
    const now = new Date();

    // Build empty day buckets
    const dayMap = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      dayMap.set(key, 0);
    }

    // Fill in counts
    for (const c of this.corrections) {
      const key = c.correctedAt.split('T')[0];
      if (dayMap.has(key)) {
        dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
      }
    }

    for (const [date, count] of dayMap.entries()) {
      trend.push({ date, count });
    }

    return trend;
  }
}

// ─── Singleton ───

let _correctionTrackerInstance: CorrectionTracker | null = null;

/**
 * Returns the singleton CorrectionTracker instance.
 * Initialized lazily on first access and persists for the process lifetime.
 */
export function getCorrectionTracker(): CorrectionTracker {
  if (!_correctionTrackerInstance) {
    _correctionTrackerInstance = new CorrectionTracker();
    logger.info({ event: 'correction_tracker_initialized' });
  }
  return _correctionTrackerInstance;
}
