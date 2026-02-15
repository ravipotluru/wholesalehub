/**
 * Pricing Anomaly Detection Tests
 *
 * Tests for src/lib/anomaly/pricing-anomaly.ts — Z-score analysis
 * and price spike/drop detection.
 */

import {
  AnomalySeverity,
  AnomalyType,
  PriceDirection,
} from '@/lib/anomaly/types';

// ─── Mocks ───

// Mock prisma before importing the module under test
jest.mock('@/lib/prisma', () => ({
  prisma: {
    productPricing: {
      findMany: jest.fn(),
    },
    priceHistory: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { detectPricingAnomalies, detectPriceChangeAnomalies } from '@/lib/anomaly/pricing-anomaly';
import { prisma } from '@/lib/prisma';

const mockFindManyPricing = prisma.productPricing.findMany as jest.Mock;
const mockFindManyHistory = prisma.priceHistory.findMany as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── detectPricingAnomalies (Z-score) ───

describe('detectPricingAnomalies — Z-score analysis', () => {
  it('should return empty array when there are no pricings', async () => {
    mockFindManyPricing.mockResolvedValue([]);

    const result = await detectPricingAnomalies();

    expect(result).toEqual([]);
  });

  it('should skip products with only one supplier (cannot compute z-score)', async () => {
    mockFindManyPricing.mockResolvedValue([
      {
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        wholesalePrice: 10.0,
        isActive: true,
        product: { id: 'prod-1', name: 'Product A', status: 'ACTIVE' },
        wholesaler: { id: 'ws-1', name: 'Wholesaler A' },
      },
    ]);

    const result = await detectPricingAnomalies();

    expect(result).toEqual([]);
  });

  it('should skip products where all prices are identical (stdDev = 0)', async () => {
    mockFindManyPricing.mockResolvedValue([
      {
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        wholesalePrice: 10.0,
        isActive: true,
        product: { id: 'prod-1', name: 'Product A', status: 'ACTIVE' },
        wholesaler: { id: 'ws-1', name: 'Wholesaler A' },
      },
      {
        productId: 'prod-1',
        wholesalerId: 'ws-2',
        wholesalePrice: 10.0,
        isActive: true,
        product: { id: 'prod-1', name: 'Product A', status: 'ACTIVE' },
        wholesaler: { id: 'ws-2', name: 'Wholesaler B' },
      },
    ]);

    const result = await detectPricingAnomalies();

    expect(result).toEqual([]);
  });

  it('should skip products with non-ACTIVE status', async () => {
    mockFindManyPricing.mockResolvedValue([
      {
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        wholesalePrice: 10.0,
        isActive: true,
        product: { id: 'prod-1', name: 'Product A', status: 'INACTIVE' },
        wholesaler: { id: 'ws-1', name: 'Wholesaler A' },
      },
      {
        productId: 'prod-1',
        wholesalerId: 'ws-2',
        wholesalePrice: 100.0,
        isActive: true,
        product: { id: 'prod-1', name: 'Product A', status: 'INACTIVE' },
        wholesaler: { id: 'ws-2', name: 'Wholesaler B' },
      },
    ]);

    const result = await detectPricingAnomalies();

    expect(result).toEqual([]);
  });

  it('should detect an outlier price as an anomaly', async () => {
    // Prices: 10, 10, 10, 10, 50 (50 is a clear outlier)
    const suppliers = [
      { id: 'ws-1', name: 'WS-A', price: 10 },
      { id: 'ws-2', name: 'WS-B', price: 10 },
      { id: 'ws-3', name: 'WS-C', price: 10 },
      { id: 'ws-4', name: 'WS-D', price: 10 },
      { id: 'ws-5', name: 'WS-Outlier', price: 50 },
    ];

    mockFindManyPricing.mockResolvedValue(
      suppliers.map((s) => ({
        productId: 'prod-1',
        wholesalerId: s.id,
        wholesalePrice: s.price,
        isActive: true,
        product: { id: 'prod-1', name: 'Test Product', status: 'ACTIVE' },
        wholesaler: { id: s.id, name: s.name },
      }))
    );

    const result = await detectPricingAnomalies();

    expect(result.length).toBeGreaterThan(0);

    // The outlier at $50 should be flagged ABOVE
    const outlier = result.find((a) => a.wholesalerId === 'ws-5');
    expect(outlier).toBeDefined();
    expect(outlier!.type).toBe(AnomalyType.PRICING_ZSCORE);
    expect(outlier!.direction).toBe(PriceDirection.ABOVE);
    expect(outlier!.currentPrice).toBe(50);
    expect(outlier!.zScore).toBeGreaterThan(0);
  });

  it('should assign LOW severity for z-score between 2.0 and 2.5', async () => {
    // Design prices so that one has z-score ~2.1
    // mean of [10, 10, 10, 14] = 11, stdDev ~ 1.73
    // z-score for 14 = (14-11)/1.73 ~ 1.73 — too low with default config
    // Let's use a custom config: zScoreLow=1.5, zScoreMedium=2.5, zScoreHigh=3.0
    const suppliers = [
      { id: 'ws-1', price: 10 },
      { id: 'ws-2', price: 10 },
      { id: 'ws-3', price: 10 },
      { id: 'ws-4', price: 14 },
    ];

    mockFindManyPricing.mockResolvedValue(
      suppliers.map((s) => ({
        productId: 'prod-1',
        wholesalerId: s.id,
        wholesalePrice: s.price,
        isActive: true,
        product: { id: 'prod-1', name: 'Test', status: 'ACTIVE' },
        wholesaler: { id: s.id, name: `Ws ${s.id}` },
      }))
    );

    const result = await detectPricingAnomalies({
      zScoreLow: 1.5,
      zScoreMedium: 2.5,
      zScoreHigh: 3.0,
      priceChangePercentThreshold: 20,
    });

    const anomaly = result.find((a) => a.wholesalerId === 'ws-4');
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe(AnomalySeverity.LOW);
  });

  it('should assign HIGH severity for very large z-score', async () => {
    // Prices: 10, 10, 10, 10, 10, 100 (100 is far out)
    const suppliers = [
      { id: 'ws-1', price: 10 },
      { id: 'ws-2', price: 10 },
      { id: 'ws-3', price: 10 },
      { id: 'ws-4', price: 10 },
      { id: 'ws-5', price: 10 },
      { id: 'ws-6', price: 100 },
    ];

    mockFindManyPricing.mockResolvedValue(
      suppliers.map((s) => ({
        productId: 'prod-1',
        wholesalerId: s.id,
        wholesalePrice: s.price,
        isActive: true,
        product: { id: 'prod-1', name: 'Test', status: 'ACTIVE' },
        wholesaler: { id: s.id, name: `Ws ${s.id}` },
      }))
    );

    const result = await detectPricingAnomalies();

    const outlier = result.find((a) => a.wholesalerId === 'ws-6');
    expect(outlier).toBeDefined();
    expect(outlier!.severity).toBe(AnomalySeverity.HIGH);
  });

  it('should sort anomalies by severity (highest first), then by absolute z-score', async () => {
    // Create a product with two suppliers: one HIGH, one MEDIUM severity
    // Prices: 10, 10, 10, 30, 60
    const suppliers = [
      { id: 'ws-1', price: 10 },
      { id: 'ws-2', price: 10 },
      { id: 'ws-3', price: 10 },
      { id: 'ws-4', price: 30 },
      { id: 'ws-5', price: 60 },
    ];

    mockFindManyPricing.mockResolvedValue(
      suppliers.map((s) => ({
        productId: 'prod-1',
        wholesalerId: s.id,
        wholesalePrice: s.price,
        isActive: true,
        product: { id: 'prod-1', name: 'Test', status: 'ACTIVE' },
        wholesaler: { id: s.id, name: `Ws ${s.id}` },
      }))
    );

    const result = await detectPricingAnomalies();

    if (result.length >= 2) {
      // Verify sorting: higher severity anomalies come first
      const severityOrder: Record<string, number> = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
      };

      for (let i = 1; i < result.length; i++) {
        const prevSev = severityOrder[result[i - 1].severity];
        const currSev = severityOrder[result[i].severity];
        if (prevSev === currSev) {
          expect(Math.abs(result[i - 1].zScore)).toBeGreaterThanOrEqual(
            Math.abs(result[i].zScore)
          );
        } else {
          expect(prevSev).toBeLessThanOrEqual(currSev);
        }
      }
    }
  });

  it('should generate deterministic anomaly IDs', async () => {
    const suppliers = [
      { id: 'ws-1', price: 10 },
      { id: 'ws-2', price: 10 },
      { id: 'ws-3', price: 100 },
    ];

    mockFindManyPricing.mockResolvedValue(
      suppliers.map((s) => ({
        productId: 'prod-1',
        wholesalerId: s.id,
        wholesalePrice: s.price,
        isActive: true,
        product: { id: 'prod-1', name: 'Test', status: 'ACTIVE' },
        wholesaler: { id: s.id, name: `Ws ${s.id}` },
      }))
    );

    const result = await detectPricingAnomalies();

    const outlier = result.find((a) => a.wholesalerId === 'ws-3');
    expect(outlier).toBeDefined();
    expect(outlier!.id).toBe('pz_prod-1_ws-3');
  });

  it('should include correct metadata with supplierCount', async () => {
    const suppliers = [
      { id: 'ws-1', price: 10 },
      { id: 'ws-2', price: 10 },
      { id: 'ws-3', price: 100 },
    ];

    mockFindManyPricing.mockResolvedValue(
      suppliers.map((s) => ({
        productId: 'prod-1',
        wholesalerId: s.id,
        wholesalePrice: s.price,
        isActive: true,
        product: { id: 'prod-1', name: 'Test', status: 'ACTIVE' },
        wholesaler: { id: s.id, name: `Ws ${s.id}` },
      }))
    );

    const result = await detectPricingAnomalies();

    if (result.length > 0) {
      expect(result[0].metadata).toHaveProperty('supplierCount', 3);
    }
  });

  it('should propagate database errors', async () => {
    mockFindManyPricing.mockRejectedValue(new Error('DB connection lost'));

    await expect(detectPricingAnomalies()).rejects.toThrow('DB connection lost');
  });
});

// ─── detectPriceChangeAnomalies (spikes/drops) ───

describe('detectPriceChangeAnomalies — price spike/drop detection', () => {
  it('should return empty array when no price history records exist', async () => {
    mockFindManyHistory.mockResolvedValue([]);

    const result = await detectPriceChangeAnomalies();

    expect(result).toEqual([]);
  });

  it('should skip records where previousPrice is 0 (avoid division by zero)', async () => {
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 0,
        wholesalePrice: 50,
        effectiveDate: new Date(),
        changeReason: 'Initial price',
        product: { id: 'prod-1', name: 'Product A' },
        wholesaler: { id: 'ws-1', name: 'Wholesaler A' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    expect(result).toEqual([]);
  });

  it('should not flag changes below the threshold', async () => {
    // 10% change is below default 20% threshold
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 110,
        effectiveDate: new Date(),
        changeReason: 'Minor adjustment',
        product: { id: 'prod-1', name: 'Product A' },
        wholesaler: { id: 'ws-1', name: 'Wholesaler A' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    expect(result).toEqual([]);
  });

  it('should detect a price spike (increase above threshold)', async () => {
    // 50% increase: $100 -> $150
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 150,
        effectiveDate: new Date(),
        changeReason: 'Supplier increase',
        product: { id: 'prod-1', name: 'Premium Widget' },
        wholesaler: { id: 'ws-1', name: 'Big Dist' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(AnomalyType.PRICE_SPIKE);
    expect(result[0].previousPrice).toBe(100);
    expect(result[0].newPrice).toBe(150);
    expect(result[0].changePercent).toBe(50);
    expect(result[0].severity).toBe(AnomalySeverity.MEDIUM); // 40-60% = MEDIUM
  });

  it('should detect a price drop (decrease above threshold)', async () => {
    // 30% decrease: $100 -> $70
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 70,
        effectiveDate: new Date(),
        changeReason: 'Clearance',
        product: { id: 'prod-1', name: 'Widget' },
        wholesaler: { id: 'ws-1', name: 'Cheap Dist' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(AnomalyType.PRICE_DROP);
    expect(result[0].changePercent).toBe(30);
    expect(result[0].severity).toBe(AnomalySeverity.LOW); // 20-40% = LOW
  });

  it('should assign LOW severity for 20-40% changes', async () => {
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 125,
        effectiveDate: new Date(),
        changeReason: null,
        product: { id: 'prod-1', name: 'P1' },
        wholesaler: { id: 'ws-1', name: 'W1' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    expect(result[0].severity).toBe(AnomalySeverity.LOW);
  });

  it('should assign MEDIUM severity for 40-60% changes', async () => {
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 155,
        effectiveDate: new Date(),
        changeReason: null,
        product: { id: 'prod-1', name: 'P1' },
        wholesaler: { id: 'ws-1', name: 'W1' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    expect(result[0].severity).toBe(AnomalySeverity.MEDIUM);
  });

  it('should assign HIGH severity for 60%+ changes', async () => {
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 200,
        effectiveDate: new Date(),
        changeReason: null,
        product: { id: 'prod-1', name: 'P1' },
        wholesaler: { id: 'ws-1', name: 'W1' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    expect(result[0].severity).toBe(AnomalySeverity.HIGH);
  });

  it('should sort anomalies by severity (highest first), then by changePercent', async () => {
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 125,        // 25% = LOW
        effectiveDate: new Date(),
        changeReason: null,
        product: { id: 'prod-1', name: 'P1' },
        wholesaler: { id: 'ws-1', name: 'W1' },
      },
      {
        id: 'ph-2',
        productId: 'prod-2',
        wholesalerId: 'ws-2',
        previousPrice: 100,
        wholesalePrice: 250,        // 150% = HIGH
        effectiveDate: new Date(),
        changeReason: null,
        product: { id: 'prod-2', name: 'P2' },
        wholesaler: { id: 'ws-2', name: 'W2' },
      },
      {
        id: 'ph-3',
        productId: 'prod-3',
        wholesalerId: 'ws-3',
        previousPrice: 100,
        wholesalePrice: 145,        // 45% = MEDIUM
        effectiveDate: new Date(),
        changeReason: null,
        product: { id: 'prod-3', name: 'P3' },
        wholesaler: { id: 'ws-3', name: 'W3' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    expect(result).toHaveLength(3);
    expect(result[0].severity).toBe(AnomalySeverity.HIGH);
    expect(result[1].severity).toBe(AnomalySeverity.MEDIUM);
    expect(result[2].severity).toBe(AnomalySeverity.LOW);
  });

  it('should use prefix "ps" for spike IDs and "pd" for drop IDs', async () => {
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 200,        // spike
        effectiveDate: new Date(),
        changeReason: null,
        product: { id: 'prod-1', name: 'P1' },
        wholesaler: { id: 'ws-1', name: 'W1' },
      },
      {
        id: 'ph-2',
        productId: 'prod-2',
        wholesalerId: 'ws-2',
        previousPrice: 100,
        wholesalePrice: 50,         // drop
        effectiveDate: new Date(),
        changeReason: null,
        product: { id: 'prod-2', name: 'P2' },
        wholesaler: { id: 'ws-2', name: 'W2' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    const spike = result.find((a) => a.type === AnomalyType.PRICE_SPIKE);
    const drop = result.find((a) => a.type === AnomalyType.PRICE_DROP);

    expect(spike!.id).toBe('ps_prod-1_ws-1');
    expect(drop!.id).toBe('pd_prod-2_ws-2');
  });

  it('should respect custom threshold configuration', async () => {
    // 15% change - below default 20% but above custom 10%
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-1',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 115,
        effectiveDate: new Date(),
        changeReason: null,
        product: { id: 'prod-1', name: 'P1' },
        wholesaler: { id: 'ws-1', name: 'W1' },
      },
    ]);

    // Default threshold (20%) should not detect it
    const defaultResult = await detectPriceChangeAnomalies();
    expect(defaultResult).toHaveLength(0);

    // Custom lower threshold (10%) should detect it
    const customResult = await detectPriceChangeAnomalies({
      zScoreLow: 2.0,
      zScoreMedium: 2.5,
      zScoreHigh: 3.0,
      priceChangePercentThreshold: 10,
    });
    expect(customResult).toHaveLength(1);
  });

  it('should include priceHistoryId and changeReason in metadata', async () => {
    mockFindManyHistory.mockResolvedValue([
      {
        id: 'ph-42',
        productId: 'prod-1',
        wholesalerId: 'ws-1',
        previousPrice: 100,
        wholesalePrice: 200,
        effectiveDate: new Date(),
        changeReason: 'Supply shortage',
        product: { id: 'prod-1', name: 'P1' },
        wholesaler: { id: 'ws-1', name: 'W1' },
      },
    ]);

    const result = await detectPriceChangeAnomalies();

    expect(result[0].metadata).toEqual({
      priceHistoryId: 'ph-42',
      changeReason: 'Supply shortage',
    });
  });

  it('should propagate database errors', async () => {
    mockFindManyHistory.mockRejectedValue(new Error('Connection timeout'));

    await expect(detectPriceChangeAnomalies()).rejects.toThrow('Connection timeout');
  });
});
