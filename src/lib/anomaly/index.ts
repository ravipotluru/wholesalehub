/**
 * Anomaly Detection Orchestrator
 *
 * Central entry point that runs all three anomaly detectors (pricing,
 * orders, inventory), aggregates results into a single report, and
 * provides history retrieval and configuration management.
 */

import { logger } from '@/lib/logger';
import { getCache, setCache } from '@/lib/redis';
import {
  detectPricingAnomalies,
  detectPriceChangeAnomalies,
} from './pricing-anomaly';
import { detectOrderAnomalies } from './order-anomaly';
import { detectInventoryAnomalies } from './inventory-anomaly';
import {
  AnomalySeverity,
  type AnomalyReport,
  type AlertConfig,
  type SeveritySummary,
  type AnyAnomaly,
} from './types';

// Re-export everything consumers may need
export * from './types';
export { detectPricingAnomalies, detectPriceChangeAnomalies } from './pricing-anomaly';
export { detectOrderAnomalies, getRetailerOrderBaseline } from './order-anomaly';
export { detectInventoryAnomalies } from './inventory-anomaly';

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────

/** Redis cache key for the latest anomaly report */
const CACHE_KEY_LATEST_REPORT = 'anomaly:report:latest';

/** Redis key prefix for historical reports */
const CACHE_KEY_HISTORY_PREFIX = 'anomaly:report:history:';

/** Cache TTL for the latest report (1 hour) */
const REPORT_CACHE_TTL_SECONDS = 3600;

/** How many historical reports to keep in cache */
const MAX_HISTORY_ENTRIES = 30;

// ─── DEFAULT CONFIGURATION ─────────────────────────────────────────────────────

/**
 * Default alert threshold configuration.
 * Can be overridden at call sites or via a future admin settings page.
 */
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  pricing: {
    zScoreLow: 2.0,
    zScoreMedium: 2.5,
    zScoreHigh: 3.0,
    priceChangePercentThreshold: 20,
  },
  orders: {
    largeOrderZScore: 2.0,
    highFrequencyMultiplier: 3.0,
    duplicateWindowHours: 24,
    baselineLookbackDays: 90,
  },
  inventory: {
    discrepancyRateThreshold: 10,
    staleDaysThreshold: 90,
    receiptQtyDeviationPercent: 25,
  },
};

// ─── ORCHESTRATOR ──────────────────────────────────────────────────────────────

/**
 * Run all anomaly detection modules and return a unified report.
 *
 * Executes pricing (Z-score + price-change), order-pattern, and inventory
 * detectors in parallel. Results are aggregated into a single
 * {@link AnomalyReport} with severity summary counts.
 *
 * The report is cached in Redis for 1 hour. Subsequent calls within that
 * window return the cached report unless `forceRefresh` is `true`.
 *
 * @param config       - Optional threshold overrides (defaults to DEFAULT_ALERT_CONFIG)
 * @param forceRefresh - If true, bypasses cache and runs a fresh scan
 * @returns A complete anomaly report
 */
export async function runAllAnomalyDetection(
  config: AlertConfig = DEFAULT_ALERT_CONFIG,
  forceRefresh = false,
): Promise<AnomalyReport> {
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = await getCache<AnomalyReport>(CACHE_KEY_LATEST_REPORT);
    if (cached) {
      logger.info({ event: 'anomaly_report_cache_hit', reportId: cached.id });
      return cached;
    }
  }

  const startTime = Date.now();
  const reportId = `ar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  logger.info({ event: 'anomaly_detection_run_start', reportId });

  try {
    // Run all detectors in parallel
    const [pricingAnomalies, priceChangeAnomalies, orderAnomalies, inventoryAnomalies] =
      await Promise.all([
        detectPricingAnomalies(config.pricing),
        detectPriceChangeAnomalies(config.pricing),
        detectOrderAnomalies(config.orders),
        detectInventoryAnomalies(config.inventory),
      ]);

    const allPricingAnomalies = [...pricingAnomalies, ...priceChangeAnomalies];

    // Compute severity summary
    const allAnomalies: AnyAnomaly[] = [
      ...allPricingAnomalies,
      ...orderAnomalies,
      ...inventoryAnomalies,
    ];

    const summary = buildSeveritySummary(allAnomalies);
    const durationMs = Date.now() - startTime;

    const report: AnomalyReport = {
      id: reportId,
      generatedAt: new Date().toISOString(),
      summary,
      pricingAnomalies: allPricingAnomalies,
      orderAnomalies,
      inventoryAnomalies,
      durationMs,
    };

    // Cache the report
    await setCache(CACHE_KEY_LATEST_REPORT, report, REPORT_CACHE_TTL_SECONDS);

    // Append to history
    await appendToHistory(report);

    logger.info({
      event: 'anomaly_detection_run_complete',
      reportId,
      durationMs,
      summary,
    });

    return report;
  } catch (error) {
    logger.error({
      event: 'anomaly_detection_run_error',
      reportId,
      error: (error as Error).message,
      stack: (error as Error).stack,
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Retrieve historical anomaly reports from cache.
 *
 * Returns past reports sorted newest-first, limited to the configured
 * retention window.
 *
 * @param days - Number of days of history to retrieve (default 7)
 * @returns Array of past anomaly reports (may be empty if cache was cleared)
 */
export async function getAnomalyHistory(
  days: number = 7,
): Promise<AnomalyReport[]> {
  try {
    const index = await getCache<string[]>(`${CACHE_KEY_HISTORY_PREFIX}index`);
    if (!index || index.length === 0) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffMs = cutoff.getTime();

    const reports: AnomalyReport[] = [];

    for (const reportId of index) {
      const report = await getCache<AnomalyReport>(
        `${CACHE_KEY_HISTORY_PREFIX}${reportId}`,
      );
      if (report) {
        const reportTime = new Date(report.generatedAt).getTime();
        if (reportTime >= cutoffMs) {
          reports.push(report);
        }
      }
    }

    // Newest first
    reports.sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );

    return reports;
  } catch (error) {
    logger.error({
      event: 'anomaly_history_fetch_error',
      error: (error as Error).message,
    });
    return [];
  }
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Build a severity summary from an array of anomalies.
 *
 * @param anomalies - All anomalies from all detectors
 * @returns Counts keyed by severity plus a total
 */
function buildSeveritySummary(anomalies: AnyAnomaly[]): SeveritySummary {
  const summary: SeveritySummary = {
    [AnomalySeverity.LOW]: 0,
    [AnomalySeverity.MEDIUM]: 0,
    [AnomalySeverity.HIGH]: 0,
    [AnomalySeverity.CRITICAL]: 0,
    total: anomalies.length,
  };

  for (const anomaly of anomalies) {
    summary[anomaly.severity] += 1;
  }

  return summary;
}

/**
 * Append a report to the cached history index.
 *
 * Maintains a rolling window of up to {@link MAX_HISTORY_ENTRIES} reports.
 *
 * @param report - The report to store
 */
async function appendToHistory(report: AnomalyReport): Promise<void> {
  try {
    const indexKey = `${CACHE_KEY_HISTORY_PREFIX}index`;
    const existingIndex = (await getCache<string[]>(indexKey)) ?? [];

    // Store the individual report (7-day TTL)
    await setCache(
      `${CACHE_KEY_HISTORY_PREFIX}${report.id}`,
      report,
      7 * 24 * 3600,
    );

    // Update the index
    const updatedIndex = [report.id, ...existingIndex].slice(0, MAX_HISTORY_ENTRIES);
    await setCache(indexKey, updatedIndex, 7 * 24 * 3600);
  } catch (error) {
    logger.warn({
      event: 'anomaly_history_append_error',
      error: (error as Error).message,
    });
  }
}
