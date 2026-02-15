/**
 * Pricing Anomaly Detection
 *
 * Uses Z-score statistical analysis to detect outlier prices across suppliers,
 * and monitors PriceHistory for sudden spikes or drops.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  AnomalySeverity,
  AnomalyType,
  PriceDirection,
  type PricingAnomaly,
  type PriceChangeAnomaly,
  type AlertConfig,
} from './types';

/** Default pricing alert thresholds */
const DEFAULT_PRICING_CONFIG: AlertConfig['pricing'] = {
  zScoreLow: 2.0,
  zScoreMedium: 2.5,
  zScoreHigh: 3.0,
  priceChangePercentThreshold: 20,
};

/**
 * Calculate the arithmetic mean of a numeric array.
 *
 * @param values - Array of numbers
 * @returns The mean, or 0 if the array is empty
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the population standard deviation of a numeric array.
 *
 * @param values - Array of numbers
 * @param avg   - Pre-computed mean (avoids redundant calculation)
 * @returns The standard deviation, or 0 if fewer than 2 values
 */
function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length);
}

/**
 * Map an absolute Z-score to a severity level.
 *
 * @param absZ   - Absolute value of the Z-score
 * @param config - Threshold configuration
 * @returns The appropriate severity level
 */
function zScoreToSeverity(
  absZ: number,
  config: AlertConfig['pricing'],
): AnomalySeverity {
  if (absZ >= config.zScoreHigh) return AnomalySeverity.HIGH;
  if (absZ >= config.zScoreMedium) return AnomalySeverity.MEDIUM;
  return AnomalySeverity.LOW;
}

/**
 * Generate a stable anomaly ID from its components.
 *
 * @param prefix      - Type prefix (e.g. "pz" for pricing Z-score)
 * @param productId   - Product identifier
 * @param wholesalerId - Wholesaler identifier
 * @returns A deterministic string identifier
 */
function anomalyId(prefix: string, productId: string, wholesalerId: string): string {
  return `${prefix}_${productId}_${wholesalerId}`;
}

/**
 * Scan all active product pricings and detect pricing anomalies via Z-score.
 *
 * For each product that has pricing from 2+ suppliers, the function computes
 * the mean and standard deviation of wholesale prices. Any price whose
 * absolute Z-score exceeds the LOW threshold (default 2.0) is flagged.
 *
 * @param config - Optional threshold overrides
 * @returns Array of pricing anomalies sorted by severity (highest first)
 */
export async function detectPricingAnomalies(
  config: AlertConfig['pricing'] = DEFAULT_PRICING_CONFIG,
): Promise<PricingAnomaly[]> {
  const startTime = Date.now();
  logger.info({ event: 'pricing_anomaly_scan_start' });

  const anomalies: PricingAnomaly[] = [];

  try {
    // Fetch all active pricings grouped with product and wholesaler data
    const pricings = await prisma.productPricing.findMany({
      where: { isActive: true },
      include: {
        product: { select: { id: true, name: true, status: true } },
        wholesaler: { select: { id: true, name: true } },
      },
    });

    // Group pricings by product
    const byProduct = new Map<
      string,
      {
        productName: string;
        entries: { wholesalerId: string; wholesalerName: string; price: number }[];
      }
    >();

    for (const p of pricings) {
      if (p.product.status !== 'ACTIVE') continue;

      const existing = byProduct.get(p.productId);
      const entry = {
        wholesalerId: p.wholesalerId,
        wholesalerName: p.wholesaler.name,
        price: Number(p.wholesalePrice),
      };

      if (existing) {
        existing.entries.push(entry);
      } else {
        byProduct.set(p.productId, {
          productName: p.product.name,
          entries: [entry],
        });
      }
    }

    // Analyze each product that has at least 2 suppliers
    const now = new Date().toISOString();

    for (const [productId, group] of byProduct) {
      if (group.entries.length < 2) continue;

      const prices = group.entries.map((e) => e.price);
      const avg = mean(prices);
      const sd = stdDev(prices, avg);

      // Skip products with zero standard deviation (all prices identical)
      if (sd === 0) continue;

      for (const entry of group.entries) {
        const zScore = (entry.price - avg) / sd;
        const absZ = Math.abs(zScore);

        if (absZ >= config.zScoreLow) {
          const direction = zScore > 0 ? PriceDirection.ABOVE : PriceDirection.BELOW;
          const percentDeviation =
            avg !== 0
              ? Math.round(((entry.price - avg) / avg) * 10000) / 100
              : 0;

          anomalies.push({
            id: anomalyId('pz', productId, entry.wholesalerId),
            type: AnomalyType.PRICING_ZSCORE,
            severity: zScoreToSeverity(absZ, config),
            description:
              `Price of $${entry.price.toFixed(2)} from ${entry.wholesalerName} ` +
              `for "${group.productName}" is ${Math.abs(percentDeviation).toFixed(1)}% ` +
              `${direction === PriceDirection.ABOVE ? 'above' : 'below'} ` +
              `the mean ($${avg.toFixed(2)}) — z-score ${zScore.toFixed(2)}`,
            entityId: productId,
            entityType: 'PRODUCT',
            detectedAt: now,
            metadata: { supplierCount: group.entries.length },
            productId,
            productName: group.productName,
            wholesalerId: entry.wholesalerId,
            wholesalerName: entry.wholesalerName,
            currentPrice: entry.price,
            meanPrice: Math.round(avg * 100) / 100,
            stdDev: Math.round(sd * 100) / 100,
            zScore: Math.round(zScore * 100) / 100,
            direction,
            percentDeviation: Math.abs(percentDeviation),
          });
        }
      }
    }

    // Sort highest severity first, then by absolute z-score descending
    const severityOrder: Record<AnomalySeverity, number> = {
      [AnomalySeverity.CRITICAL]: 0,
      [AnomalySeverity.HIGH]: 1,
      [AnomalySeverity.MEDIUM]: 2,
      [AnomalySeverity.LOW]: 3,
    };

    anomalies.sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return Math.abs(b.zScore) - Math.abs(a.zScore);
    });

    logger.info({
      event: 'pricing_anomaly_scan_complete',
      anomalyCount: anomalies.length,
      productsScanned: byProduct.size,
      durationMs: Date.now() - startTime,
    });

    return anomalies;
  } catch (error) {
    logger.error({
      event: 'pricing_anomaly_scan_error',
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}

/**
 * Check PriceHistory for sudden price spikes or drops.
 *
 * Scans price history records from the last 30 days. Any record whose
 * absolute price change percentage exceeds the configured threshold
 * (default 20%) is flagged.
 *
 * @param config - Optional threshold overrides
 * @returns Array of price-change anomalies sorted by severity
 */
export async function detectPriceChangeAnomalies(
  config: AlertConfig['pricing'] = DEFAULT_PRICING_CONFIG,
): Promise<PriceChangeAnomaly[]> {
  const startTime = Date.now();
  logger.info({ event: 'price_change_anomaly_scan_start' });

  const anomalies: PriceChangeAnomaly[] = [];

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const priceChanges = await prisma.priceHistory.findMany({
      where: {
        effectiveDate: { gte: thirtyDaysAgo },
        previousPrice: { not: null },
      },
      include: {
        product: { select: { id: true, name: true } },
        wholesaler: { select: { id: true, name: true } },
      },
      orderBy: { effectiveDate: 'desc' },
    });

    const now = new Date().toISOString();

    for (const change of priceChanges) {
      const prevPrice = Number(change.previousPrice);
      const newPrice = Number(change.wholesalePrice);

      if (prevPrice === 0) continue;

      const changePercent = Math.abs(((newPrice - prevPrice) / prevPrice) * 100);

      if (changePercent >= config.priceChangePercentThreshold) {
        const isSpike = newPrice > prevPrice;
        const anomalyType = isSpike ? AnomalyType.PRICE_SPIKE : AnomalyType.PRICE_DROP;

        // Severity: 20-40% = LOW, 40-60% = MEDIUM, 60%+ = HIGH
        let severity: AnomalySeverity;
        if (changePercent >= 60) {
          severity = AnomalySeverity.HIGH;
        } else if (changePercent >= 40) {
          severity = AnomalySeverity.MEDIUM;
        } else {
          severity = AnomalySeverity.LOW;
        }

        anomalies.push({
          id: anomalyId(
            isSpike ? 'ps' : 'pd',
            change.productId,
            change.wholesalerId,
          ),
          type: anomalyType,
          severity,
          description:
            `${isSpike ? 'Price spike' : 'Price drop'} of ${changePercent.toFixed(1)}% ` +
            `for "${change.product.name}" from ${change.wholesaler.name}: ` +
            `$${prevPrice.toFixed(2)} -> $${newPrice.toFixed(2)}`,
          entityId: change.productId,
          entityType: 'PRODUCT',
          detectedAt: now,
          metadata: {
            priceHistoryId: change.id,
            changeReason: change.changeReason,
          },
          productId: change.productId,
          productName: change.product.name,
          wholesalerId: change.wholesalerId,
          wholesalerName: change.wholesaler.name,
          previousPrice: prevPrice,
          newPrice,
          changePercent: Math.round(changePercent * 100) / 100,
          effectiveDate: change.effectiveDate.toISOString(),
        });
      }
    }

    // Sort highest severity first
    const severityOrder: Record<AnomalySeverity, number> = {
      [AnomalySeverity.CRITICAL]: 0,
      [AnomalySeverity.HIGH]: 1,
      [AnomalySeverity.MEDIUM]: 2,
      [AnomalySeverity.LOW]: 3,
    };

    anomalies.sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return b.changePercent - a.changePercent;
    });

    logger.info({
      event: 'price_change_anomaly_scan_complete',
      anomalyCount: anomalies.length,
      recordsScanned: priceChanges.length,
      durationMs: Date.now() - startTime,
    });

    return anomalies;
  } catch (error) {
    logger.error({
      event: 'price_change_anomaly_scan_error',
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}
