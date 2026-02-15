/**
 * Order Pattern Anomaly Detection
 *
 * Detects anomalous ordering behaviour such as unusually large orders,
 * sudden frequency spikes, orders at unusual hours, and duplicate-looking
 * orders within a short time window.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  AnomalySeverity,
  AnomalyType,
  type OrderAnomaly,
  type RetailerOrderBaseline,
  type AlertConfig,
} from './types';

/** Default order-pattern alert thresholds */
const DEFAULT_ORDER_CONFIG: AlertConfig['orders'] = {
  largeOrderZScore: 2.0,
  highFrequencyMultiplier: 3.0,
  duplicateWindowHours: 24,
  baselineLookbackDays: 90,
};

/**
 * Calculate arithmetic mean of a numeric array.
 *
 * @param values - Array of numbers
 * @returns The mean, or 0 when empty
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Calculate population standard deviation.
 *
 * @param values - Array of numbers
 * @param avg   - Pre-computed mean
 * @returns Standard deviation, or 0 when fewer than 2 values
 */
function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const sq = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(sq.reduce((s, d) => s + d, 0) / values.length);
}

/**
 * Compute the historical order baseline for a single retailer.
 *
 * The lookback window defaults to 90 days. Returns average order value,
 * standard deviation of values, and average orders per week.
 *
 * @param retailerId - Prisma retailer ID
 * @param lookbackDays - Number of days to look back (default 90)
 * @returns Baseline metrics for the retailer
 */
export async function getRetailerOrderBaseline(
  retailerId: string,
  lookbackDays: number = DEFAULT_ORDER_CONFIG.baselineLookbackDays,
): Promise<RetailerOrderBaseline> {
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - lookbackDays);
  const periodEnd = new Date();

  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: { name: true },
  });

  const orders = await prisma.order.findMany({
    where: {
      retailerId,
      orderDate: { gte: periodStart },
    },
    select: { totalAmount: true, orderDate: true },
    orderBy: { orderDate: 'asc' },
  });

  const values = orders.map((o) => Number(o.totalAmount));
  const avg = mean(values);
  const sd = stdDev(values, avg);
  const weeks = Math.max(lookbackDays / 7, 1);

  return {
    retailerId,
    retailerName: retailer?.name ?? 'Unknown',
    avgOrderValue: Math.round(avg * 100) / 100,
    stdDevOrderValue: Math.round(sd * 100) / 100,
    avgOrdersPerWeek: Math.round((orders.length / weeks) * 100) / 100,
    totalOrders: orders.length,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

/**
 * Run all order-pattern anomaly detection checks.
 *
 * Detects:
 * - Unusually large orders (Z-score on order value per retailer)
 * - Unusual order frequency (sudden spike in orders from a retailer)
 * - Orders placed at unusual hours (before 6 AM or after 10 PM)
 * - Duplicate-looking orders (same retailer + supplier + items within 24h)
 *
 * @param config - Optional threshold overrides
 * @returns Array of order anomalies sorted by severity
 */
export async function detectOrderAnomalies(
  config: AlertConfig['orders'] = DEFAULT_ORDER_CONFIG,
): Promise<OrderAnomaly[]> {
  const startTime = Date.now();
  logger.info({ event: 'order_anomaly_scan_start' });

  const anomalies: OrderAnomaly[] = [];
  const now = new Date().toISOString();

  try {
    // ── 1. Large order detection ──────────────────────────────────────────
    await detectLargeOrders(anomalies, config, now);

    // ── 2. High frequency detection ───────────────────────────────────────
    await detectHighFrequency(anomalies, config, now);

    // ── 3. Unusual hours detection ────────────────────────────────────────
    await detectUnusualHours(anomalies, now);

    // ── 4. Duplicate order detection ──────────────────────────────────────
    await detectDuplicateOrders(anomalies, config, now);

    // Sort by severity
    const severityOrder: Record<AnomalySeverity, number> = {
      [AnomalySeverity.CRITICAL]: 0,
      [AnomalySeverity.HIGH]: 1,
      [AnomalySeverity.MEDIUM]: 2,
      [AnomalySeverity.LOW]: 3,
    };

    anomalies.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
    );

    logger.info({
      event: 'order_anomaly_scan_complete',
      anomalyCount: anomalies.length,
      durationMs: Date.now() - startTime,
    });

    return anomalies;
  } catch (error) {
    logger.error({
      event: 'order_anomaly_scan_error',
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}

// ─── INTERNAL DETECTORS ────────────────────────────────────────────────────────

/**
 * Detect orders whose total value is an outlier for the retailer.
 *
 * For each retailer that has 5+ orders in the lookback period, compute
 * a Z-score on recent orders (last 7 days). Flag any order whose value
 * z-score exceeds the threshold.
 */
async function detectLargeOrders(
  anomalies: OrderAnomaly[],
  config: AlertConfig['orders'],
  now: string,
): Promise<void> {
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - config.baselineLookbackDays);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get recent orders (last 7 days) with retailer info
  const recentOrders = await prisma.order.findMany({
    where: { orderDate: { gte: sevenDaysAgo } },
    include: {
      retailer: { select: { id: true, name: true } },
      wholesaler: { select: { id: true, name: true } },
    },
    orderBy: { orderDate: 'desc' },
  });

  // For each unique retailer in recent orders, compute baseline
  const retailerIds = [...new Set(recentOrders.map((o) => o.retailerId))];

  for (const retailerId of retailerIds) {
    const baseline = await getRetailerOrderBaseline(retailerId, config.baselineLookbackDays);

    // Need sufficient history for meaningful Z-scores
    if (baseline.totalOrders < 5 || baseline.stdDevOrderValue === 0) continue;

    const retailerRecent = recentOrders.filter((o) => o.retailerId === retailerId);

    for (const order of retailerRecent) {
      const value = Number(order.totalAmount);
      const zScore = (value - baseline.avgOrderValue) / baseline.stdDevOrderValue;

      if (zScore >= config.largeOrderZScore) {
        let severity: AnomalySeverity;
        if (zScore >= 4) {
          severity = AnomalySeverity.CRITICAL;
        } else if (zScore >= 3) {
          severity = AnomalySeverity.HIGH;
        } else if (zScore >= 2.5) {
          severity = AnomalySeverity.MEDIUM;
        } else {
          severity = AnomalySeverity.LOW;
        }

        anomalies.push({
          id: `lo_${order.id}`,
          type: AnomalyType.LARGE_ORDER,
          severity,
          description:
            `Order ${order.orderNumber} from ${order.retailer.name} ` +
            `totals $${value.toFixed(2)}, which is ${zScore.toFixed(1)}x std devs ` +
            `above their average of $${baseline.avgOrderValue.toFixed(2)}`,
          entityId: order.id,
          entityType: 'ORDER',
          detectedAt: now,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            retailerId,
            retailerName: order.retailer.name,
            wholesalerId: order.wholesalerId,
            wholesalerName: order.wholesaler.name,
            orderValue: value,
            avgOrderValue: baseline.avgOrderValue,
            stdDevOrderValue: baseline.stdDevOrderValue,
            zScore: Math.round(zScore * 100) / 100,
          },
        });
      }
    }
  }
}

/**
 * Detect retailers whose recent order frequency is significantly above baseline.
 *
 * Compares the number of orders in the current week to the retailer's
 * average weekly orders. If it exceeds highFrequencyMultiplier * avgPerWeek,
 * it is flagged.
 */
async function detectHighFrequency(
  anomalies: OrderAnomaly[],
  config: AlertConfig['orders'],
  now: string,
): Promise<void> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // Count orders per retailer in the last 7 days
  const recentCounts = await prisma.order.groupBy({
    by: ['retailerId'],
    where: { orderDate: { gte: oneWeekAgo } },
    _count: { id: true },
  });

  for (const group of recentCounts) {
    const baseline = await getRetailerOrderBaseline(
      group.retailerId,
      config.baselineLookbackDays,
    );

    // Only flag if there is meaningful history and the current week count is anomalous
    if (baseline.totalOrders < 4 || baseline.avgOrdersPerWeek === 0) continue;

    const currentWeekCount = group._count.id;
    const ratio = currentWeekCount / baseline.avgOrdersPerWeek;

    if (ratio >= config.highFrequencyMultiplier) {
      let severity: AnomalySeverity;
      if (ratio >= 6) {
        severity = AnomalySeverity.CRITICAL;
      } else if (ratio >= 4) {
        severity = AnomalySeverity.HIGH;
      } else {
        severity = AnomalySeverity.MEDIUM;
      }

      anomalies.push({
        id: `hf_${group.retailerId}`,
        type: AnomalyType.HIGH_FREQUENCY,
        severity,
        description:
          `Retailer "${baseline.retailerName}" placed ${currentWeekCount} orders ` +
          `this week, which is ${ratio.toFixed(1)}x their average ` +
          `of ${baseline.avgOrdersPerWeek.toFixed(1)} per week`,
        entityId: group.retailerId,
        entityType: 'RETAILER',
        detectedAt: now,
        metadata: {
          retailerId: group.retailerId,
          retailerName: baseline.retailerName,
          currentWeekOrders: currentWeekCount,
          avgOrdersPerWeek: baseline.avgOrdersPerWeek,
          ratio: Math.round(ratio * 100) / 100,
        },
      });
    }
  }
}

/**
 * Detect orders placed at unusual hours (before 6 AM or after 10 PM).
 *
 * Scans orders from the last 7 days and flags those whose creation
 * timestamp falls outside normal business hours.
 */
async function detectUnusualHours(
  anomalies: OrderAnomaly[],
  now: string,
): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentOrders = await prisma.order.findMany({
    where: { orderDate: { gte: sevenDaysAgo } },
    include: {
      retailer: { select: { name: true } },
      wholesaler: { select: { name: true } },
    },
    orderBy: { orderDate: 'desc' },
  });

  for (const order of recentOrders) {
    const hour = order.orderDate.getUTCHours();

    // Unusual: before 6 AM or after 10 PM (UTC)
    if (hour < 6 || hour >= 22) {
      anomalies.push({
        id: `uh_${order.id}`,
        type: AnomalyType.UNUSUAL_HOUR,
        severity: AnomalySeverity.LOW,
        description:
          `Order ${order.orderNumber} was placed at ${order.orderDate.toISOString()} ` +
          `(${hour}:00 UTC), outside normal business hours (06:00-22:00)`,
        entityId: order.id,
        entityType: 'ORDER',
        detectedAt: now,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          retailerName: order.retailer.name,
          wholesalerName: order.wholesaler.name,
          orderHourUTC: hour,
          orderDate: order.orderDate.toISOString(),
        },
      });
    }
  }
}

/**
 * Detect duplicate-looking orders.
 *
 * A "duplicate" is defined as the same retailer placing an order with the
 * same supplier containing the same set of product IDs within the
 * configured window (default 24 hours).
 */
async function detectDuplicateOrders(
  anomalies: OrderAnomaly[],
  config: AlertConfig['orders'],
  now: string,
): Promise<void> {
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - config.duplicateWindowHours);

  const recentOrders = await prisma.order.findMany({
    where: { orderDate: { gte: windowStart } },
    include: {
      lines: { select: { productId: true }, orderBy: { productId: 'asc' } },
      retailer: { select: { name: true } },
      wholesaler: { select: { name: true } },
    },
    orderBy: { orderDate: 'asc' },
  });

  // Build a fingerprint for each order: retailerId + wholesalerId + sorted product IDs
  const fingerprints = new Map<
    string,
    { orderId: string; orderNumber: string; retailerName: string; wholesalerName: string; orderDate: Date }[]
  >();

  for (const order of recentOrders) {
    const productIds = order.lines.map((l) => l.productId).join(',');
    const fp = `${order.retailerId}|${order.wholesalerId}|${productIds}`;

    const existing = fingerprints.get(fp);
    const entry = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      retailerName: order.retailer.name,
      wholesalerName: order.wholesaler.name,
      orderDate: order.orderDate,
    };

    if (existing) {
      existing.push(entry);
    } else {
      fingerprints.set(fp, [entry]);
    }
  }

  // Any fingerprint with 2+ orders is a potential duplicate
  for (const [, orders] of fingerprints) {
    if (orders.length < 2) continue;

    // Flag all but the first order
    for (let i = 1; i < orders.length; i++) {
      const dup = orders[i];
      const original = orders[0];

      anomalies.push({
        id: `do_${dup.orderId}`,
        type: AnomalyType.DUPLICATE_ORDER,
        severity: AnomalySeverity.MEDIUM,
        description:
          `Order ${dup.orderNumber} from ${dup.retailerName} to ${dup.wholesalerName} ` +
          `looks like a duplicate of ${original.orderNumber} — same items placed within ` +
          `${config.duplicateWindowHours}h`,
        entityId: dup.orderId,
        entityType: 'ORDER',
        detectedAt: now,
        metadata: {
          duplicateOrderId: dup.orderId,
          duplicateOrderNumber: dup.orderNumber,
          originalOrderId: original.orderId,
          originalOrderNumber: original.orderNumber,
          retailerName: dup.retailerName,
          wholesalerName: dup.wholesalerName,
          timeBetween:
            Math.round(
              (dup.orderDate.getTime() - original.orderDate.getTime()) / 60000,
            ) + ' minutes',
        },
      });
    }
  }
}
