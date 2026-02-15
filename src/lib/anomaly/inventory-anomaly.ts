/**
 * Inventory Anomaly Detection
 *
 * Detects anomalies in warehouse inventory data including low-stock alerts,
 * negative available quantities, high discrepancy rates per supplier,
 * stale inventory, and receipt quantity anomalies.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  AnomalySeverity,
  AnomalyType,
  type InventoryAnomaly,
  type AlertConfig,
} from './types';

/** Default inventory alert thresholds */
const DEFAULT_INVENTORY_CONFIG: AlertConfig['inventory'] = {
  discrepancyRateThreshold: 10,
  staleDaysThreshold: 90,
  receiptQtyDeviationPercent: 25,
};

/**
 * Run all inventory anomaly detection checks.
 *
 * Detects:
 * - Stock levels below reorder point
 * - Negative available quantities
 * - High discrepancy rates per supplier (>10% by default)
 * - Stale inventory (not received in 90+ days by default)
 * - Receipt quantity anomalies (received qty significantly different from expected)
 *
 * @param config - Optional threshold overrides
 * @returns Array of inventory anomalies sorted by severity
 */
export async function detectInventoryAnomalies(
  config: AlertConfig['inventory'] = DEFAULT_INVENTORY_CONFIG,
): Promise<InventoryAnomaly[]> {
  const startTime = Date.now();
  logger.info({ event: 'inventory_anomaly_scan_start' });

  const anomalies: InventoryAnomaly[] = [];
  const now = new Date().toISOString();

  try {
    // Run all sub-detectors concurrently
    await Promise.all([
      detectLowStock(anomalies, now),
      detectNegativeQuantities(anomalies, now),
      detectHighDiscrepancyRates(anomalies, config, now),
      detectStaleInventory(anomalies, config, now),
      detectReceiptQtyAnomalies(anomalies, config, now),
    ]);

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
      event: 'inventory_anomaly_scan_complete',
      anomalyCount: anomalies.length,
      durationMs: Date.now() - startTime,
    });

    return anomalies;
  } catch (error) {
    logger.error({
      event: 'inventory_anomaly_scan_error',
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}

// ─── INTERNAL DETECTORS ────────────────────────────────────────────────────────

/**
 * Detect products whose on-hand quantity has fallen below the reorder point.
 *
 * Severity is based on how far below the reorder point the stock is:
 * - 0 quantity = HIGH
 * - Below 50% of reorder point = MEDIUM
 * - Below reorder point = LOW
 */
async function detectLowStock(
  anomalies: InventoryAnomaly[],
  now: string,
): Promise<void> {
  const inventoryRecords = await prisma.inventoryOnHand.findMany({
    where: {
      reorderPoint: { not: null },
    },
    include: {
      product: { select: { id: true, name: true, sku: true, status: true } },
    },
  });

  for (const inv of inventoryRecords) {
    if (inv.product.status !== 'ACTIVE') continue;
    if (inv.reorderPoint === null) continue;

    const onHand = inv.quantityOnHand;
    const reorderPt = inv.reorderPoint;

    if (onHand <= reorderPt) {
      let severity: AnomalySeverity;
      if (onHand <= 0) {
        severity = AnomalySeverity.HIGH;
      } else if (onHand <= reorderPt * 0.5) {
        severity = AnomalySeverity.MEDIUM;
      } else {
        severity = AnomalySeverity.LOW;
      }

      anomalies.push({
        id: `ls_${inv.productId}`,
        type: AnomalyType.LOW_STOCK,
        severity,
        description:
          onHand <= 0
            ? `"${inv.product.name}" (${inv.product.sku}) is out of stock ` +
              `— reorder point is ${reorderPt} units`
            : `"${inv.product.name}" (${inv.product.sku}) has ${onHand} units on hand, ` +
              `below reorder point of ${reorderPt}`,
        entityId: inv.productId,
        entityType: 'PRODUCT',
        detectedAt: now,
        metadata: {
          productId: inv.productId,
          sku: inv.product.sku,
          quantityOnHand: onHand,
          quantityAvailable: inv.quantityAvailable,
          quantityReserved: inv.quantityReserved,
          reorderPoint: reorderPt,
        },
      });
    }
  }
}

/**
 * Detect products with negative available quantities.
 *
 * Negative available quantities indicate a data integrity issue — this is
 * always HIGH severity because it means overselling or incorrect adjustments.
 */
async function detectNegativeQuantities(
  anomalies: InventoryAnomaly[],
  now: string,
): Promise<void> {
  const negativeRecords = await prisma.inventoryOnHand.findMany({
    where: {
      quantityAvailable: { lt: 0 },
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
    },
  });

  for (const inv of negativeRecords) {
    anomalies.push({
      id: `nq_${inv.productId}`,
      type: AnomalyType.NEGATIVE_QUANTITY,
      severity: AnomalySeverity.HIGH,
      description:
        `"${inv.product.name}" (${inv.product.sku}) has negative available quantity: ` +
        `${inv.quantityAvailable}. On-hand: ${inv.quantityOnHand}, ` +
        `reserved: ${inv.quantityReserved}. Possible oversell or data error.`,
      entityId: inv.productId,
      entityType: 'PRODUCT',
      detectedAt: now,
      metadata: {
        productId: inv.productId,
        sku: inv.product.sku,
        quantityOnHand: inv.quantityOnHand,
        quantityAvailable: inv.quantityAvailable,
        quantityReserved: inv.quantityReserved,
      },
    });
  }
}

/**
 * Detect suppliers with high discrepancy rates on receipts.
 *
 * For each supplier, compute the ratio of receipts with discrepancies to
 * total receipts (within the last 90 days). If the rate exceeds the
 * threshold (default 10%), flag the supplier.
 */
async function detectHighDiscrepancyRates(
  anomalies: InventoryAnomaly[],
  config: AlertConfig['inventory'],
  now: string,
): Promise<void> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Get all receipts with supplier info in the last 90 days
  const receipts = await prisma.inventoryReceipt.findMany({
    where: {
      createdAt: { gte: ninetyDaysAgo },
      supplierId: { not: null },
    },
    select: {
      supplierId: true,
      discrepancyCount: true,
    },
  });

  // Group by supplier
  const supplierStats = new Map<
    string,
    { total: number; withDiscrepancies: number }
  >();

  for (const receipt of receipts) {
    if (!receipt.supplierId) continue;
    const existing = supplierStats.get(receipt.supplierId) ?? {
      total: 0,
      withDiscrepancies: 0,
    };
    existing.total += 1;
    if (receipt.discrepancyCount > 0) {
      existing.withDiscrepancies += 1;
    }
    supplierStats.set(receipt.supplierId, existing);
  }

  for (const [supplierId, stats] of supplierStats) {
    if (stats.total < 3) continue; // Need minimum sample size

    const rate = (stats.withDiscrepancies / stats.total) * 100;

    if (rate >= config.discrepancyRateThreshold) {
      let severity: AnomalySeverity;
      if (rate >= 40) {
        severity = AnomalySeverity.CRITICAL;
      } else if (rate >= 25) {
        severity = AnomalySeverity.HIGH;
      } else if (rate >= 15) {
        severity = AnomalySeverity.MEDIUM;
      } else {
        severity = AnomalySeverity.LOW;
      }

      anomalies.push({
        id: `hd_${supplierId}`,
        type: AnomalyType.HIGH_DISCREPANCY,
        severity,
        description:
          `Supplier ${supplierId} has a ${rate.toFixed(1)}% discrepancy rate ` +
          `(${stats.withDiscrepancies} of ${stats.total} receipts) in the last 90 days`,
        entityId: supplierId,
        entityType: 'SUPPLIER',
        detectedAt: now,
        metadata: {
          supplierId,
          totalReceipts: stats.total,
          receiptsWithDiscrepancies: stats.withDiscrepancies,
          discrepancyRate: Math.round(rate * 100) / 100,
        },
      });
    }
  }
}

/**
 * Detect products with stale inventory (no receipt in N+ days).
 *
 * Products that have not been received in the configured threshold
 * (default 90 days) may indicate supply chain issues.
 */
async function detectStaleInventory(
  anomalies: InventoryAnomaly[],
  config: AlertConfig['inventory'],
  now: string,
): Promise<void> {
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - config.staleDaysThreshold);

  const staleRecords = await prisma.inventoryOnHand.findMany({
    where: {
      OR: [
        { lastReceivedDate: { lt: staleDate } },
        { lastReceivedDate: null },
      ],
      quantityOnHand: { gt: 0 },
    },
    include: {
      product: { select: { id: true, name: true, sku: true, status: true } },
    },
  });

  for (const inv of staleRecords) {
    if (inv.product.status !== 'ACTIVE') continue;

    const daysSinceReceipt = inv.lastReceivedDate
      ? Math.floor(
          (Date.now() - inv.lastReceivedDate.getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    let severity: AnomalySeverity;
    if (daysSinceReceipt === null || daysSinceReceipt >= 180) {
      severity = AnomalySeverity.MEDIUM;
    } else {
      severity = AnomalySeverity.LOW;
    }

    anomalies.push({
      id: `si_${inv.productId}`,
      type: AnomalyType.STALE_INVENTORY,
      severity,
      description:
        daysSinceReceipt !== null
          ? `"${inv.product.name}" (${inv.product.sku}) has not been received ` +
            `in ${daysSinceReceipt} days — ${inv.quantityOnHand} units remaining`
          : `"${inv.product.name}" (${inv.product.sku}) has never been received ` +
            `but has ${inv.quantityOnHand} units on hand`,
      entityId: inv.productId,
      entityType: 'PRODUCT',
      detectedAt: now,
      metadata: {
        productId: inv.productId,
        sku: inv.product.sku,
        quantityOnHand: inv.quantityOnHand,
        lastReceivedDate: inv.lastReceivedDate?.toISOString() ?? null,
        daysSinceReceipt,
      },
    });
  }
}

/**
 * Detect receipt lines where the received quantity deviates significantly
 * from the expected quantity.
 *
 * Scans receipt lines from the last 30 days where both expected and
 * received quantities are known. If the deviation exceeds the threshold
 * (default 25%), the line is flagged.
 */
async function detectReceiptQtyAnomalies(
  anomalies: InventoryAnomaly[],
  config: AlertConfig['inventory'],
  now: string,
): Promise<void> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const receiptLines = await prisma.receiptLine.findMany({
    where: {
      createdAt: { gte: thirtyDaysAgo },
      qtyExpected: { gt: 0 },
      lineStatus: { not: 'PENDING' },
    },
    include: {
      receipt: { select: { receiptNumber: true, supplierId: true } },
      product: { select: { name: true, sku: true } },
    },
  });

  for (const line of receiptLines) {
    if (line.qtyExpected === 0) continue;

    const deviation =
      Math.abs(line.qtyReceived - line.qtyExpected) / line.qtyExpected * 100;

    if (deviation >= config.receiptQtyDeviationPercent) {
      const isShort = line.qtyReceived < line.qtyExpected;

      let severity: AnomalySeverity;
      if (deviation >= 75) {
        severity = AnomalySeverity.HIGH;
      } else if (deviation >= 50) {
        severity = AnomalySeverity.MEDIUM;
      } else {
        severity = AnomalySeverity.LOW;
      }

      const productLabel = line.product
        ? `"${line.product.name}" (${line.product.sku})`
        : `"${line.productName}" (${line.sku ?? 'no SKU'})`;

      anomalies.push({
        id: `rq_${line.id}`,
        type: AnomalyType.RECEIPT_QTY_ANOMALY,
        severity,
        description:
          `Receipt ${line.receipt.receiptNumber}: ${productLabel} — ` +
          `expected ${line.qtyExpected}, received ${line.qtyReceived} ` +
          `(${isShort ? 'short' : 'over'} by ${deviation.toFixed(1)}%)`,
        entityId: line.id,
        entityType: 'RECEIPT_LINE',
        detectedAt: now,
        metadata: {
          receiptLineId: line.id,
          receiptNumber: line.receipt.receiptNumber,
          supplierId: line.receipt.supplierId,
          productId: line.productId,
          productName: line.product?.name ?? line.productName,
          sku: line.product?.sku ?? line.sku,
          qtyExpected: line.qtyExpected,
          qtyReceived: line.qtyReceived,
          qtyDamaged: line.qtyDamaged,
          deviationPercent: Math.round(deviation * 100) / 100,
          direction: isShort ? 'SHORT' : 'OVER',
        },
      });
    }
  }
}
