/**
 * Anomaly Detection Type Definitions
 *
 * All TypeScript interfaces, enums, and type aliases used by the
 * WholesaleHub anomaly detection system (pricing, orders, inventory).
 */

// ─── ENUMS ───

/** Severity classification for detected anomalies */
export enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/** Exhaustive list of anomaly types detected across all modules */
export enum AnomalyType {
  // Pricing anomalies
  PRICING_ZSCORE = 'PRICING_ZSCORE',
  PRICE_SPIKE = 'PRICE_SPIKE',
  PRICE_DROP = 'PRICE_DROP',

  // Order anomalies
  LARGE_ORDER = 'LARGE_ORDER',
  HIGH_FREQUENCY = 'HIGH_FREQUENCY',
  UNUSUAL_HOUR = 'UNUSUAL_HOUR',
  DUPLICATE_ORDER = 'DUPLICATE_ORDER',

  // Inventory anomalies
  LOW_STOCK = 'LOW_STOCK',
  NEGATIVE_QUANTITY = 'NEGATIVE_QUANTITY',
  HIGH_DISCREPANCY = 'HIGH_DISCREPANCY',
  STALE_INVENTORY = 'STALE_INVENTORY',
  RECEIPT_QTY_ANOMALY = 'RECEIPT_QTY_ANOMALY',
}

/** Direction of a pricing deviation */
export enum PriceDirection {
  ABOVE = 'ABOVE',
  BELOW = 'BELOW',
}

// ─── BASE ANOMALY ───

/** Fields shared by every anomaly regardless of type */
export interface BaseAnomaly {
  /** Unique identifier for this anomaly instance */
  id: string;
  /** The type of anomaly detected */
  type: AnomalyType;
  /** Severity level based on business impact */
  severity: AnomalySeverity;
  /** Human-readable description of the anomaly */
  description: string;
  /** ID of the primary entity involved (product, order, retailer, etc.) */
  entityId: string;
  /** Entity type label (e.g. "PRODUCT", "ORDER", "RETAILER") */
  entityType: string;
  /** Timestamp when the anomaly was detected */
  detectedAt: string;
  /** Arbitrary key-value metadata for additional context */
  metadata: Record<string, unknown>;
}

// ─── PRICING ANOMALIES ───

/** A single pricing anomaly detected via Z-score analysis */
export interface PricingAnomaly extends BaseAnomaly {
  type: AnomalyType.PRICING_ZSCORE;
  /** Product that has the anomalous pricing */
  productId: string;
  productName: string;
  /** Wholesaler offering the anomalous price */
  wholesalerId: string;
  wholesalerName: string;
  /** Current wholesale price from this supplier */
  currentPrice: number;
  /** Mean price across all suppliers for this product */
  meanPrice: number;
  /** Standard deviation of prices across suppliers */
  stdDev: number;
  /** Z-score: (currentPrice - mean) / stdDev */
  zScore: number;
  /** Whether the price is above or below the mean */
  direction: PriceDirection;
  /** Percentage deviation from the mean price */
  percentDeviation: number;
}

/** A sudden spike or drop detected in the PriceHistory table */
export interface PriceChangeAnomaly extends BaseAnomaly {
  type: AnomalyType.PRICE_SPIKE | AnomalyType.PRICE_DROP;
  productId: string;
  productName: string;
  wholesalerId: string;
  wholesalerName: string;
  /** Price before the change */
  previousPrice: number;
  /** Price after the change */
  newPrice: number;
  /** Absolute percent change: |newPrice - previousPrice| / previousPrice * 100 */
  changePercent: number;
  /** When the price change took effect */
  effectiveDate: string;
}

// ─── ORDER ANOMALIES ───

/** An anomaly detected in order patterns */
export interface OrderAnomaly extends BaseAnomaly {
  type:
    | AnomalyType.LARGE_ORDER
    | AnomalyType.HIGH_FREQUENCY
    | AnomalyType.UNUSUAL_HOUR
    | AnomalyType.DUPLICATE_ORDER;
}

/** Historical baseline metrics for a single retailer */
export interface RetailerOrderBaseline {
  retailerId: string;
  retailerName: string;
  /** Average total order value over the lookback period */
  avgOrderValue: number;
  /** Standard deviation of order values */
  stdDevOrderValue: number;
  /** Average number of orders per week */
  avgOrdersPerWeek: number;
  /** Total number of orders in the lookback period */
  totalOrders: number;
  /** Start of the lookback window */
  periodStart: string;
  /** End of the lookback window */
  periodEnd: string;
}

// ─── INVENTORY ANOMALIES ───

/** An anomaly detected in inventory data */
export interface InventoryAnomaly extends BaseAnomaly {
  type:
    | AnomalyType.LOW_STOCK
    | AnomalyType.NEGATIVE_QUANTITY
    | AnomalyType.HIGH_DISCREPANCY
    | AnomalyType.STALE_INVENTORY
    | AnomalyType.RECEIPT_QTY_ANOMALY;
}

// ─── REPORT ───

/** Summary counts keyed by severity level */
export interface SeveritySummary {
  [AnomalySeverity.LOW]: number;
  [AnomalySeverity.MEDIUM]: number;
  [AnomalySeverity.HIGH]: number;
  [AnomalySeverity.CRITICAL]: number;
  total: number;
}

/** Full anomaly detection report returned by the orchestrator */
export interface AnomalyReport {
  /** Unique report identifier */
  id: string;
  /** ISO-8601 timestamp when the report was generated */
  generatedAt: string;
  /** Counts broken down by severity */
  summary: SeveritySummary;
  /** All pricing anomalies (Z-score and price-change) */
  pricingAnomalies: (PricingAnomaly | PriceChangeAnomaly)[];
  /** All order-pattern anomalies */
  orderAnomalies: OrderAnomaly[];
  /** All inventory anomalies */
  inventoryAnomalies: InventoryAnomaly[];
  /** Duration of the detection run in milliseconds */
  durationMs: number;
}

// ─── CONFIGURATION ───

/** Configurable thresholds for anomaly detection */
export interface AlertConfig {
  /** Z-score thresholds for pricing anomalies */
  pricing: {
    /** Z-score above which LOW severity is triggered (default 2.0) */
    zScoreLow: number;
    /** Z-score above which MEDIUM severity is triggered (default 2.5) */
    zScoreMedium: number;
    /** Z-score above which HIGH severity is triggered (default 3.0) */
    zScoreHigh: number;
    /** Percent change threshold that triggers a price spike/drop alert (default 20) */
    priceChangePercentThreshold: number;
  };
  /** Thresholds for order-pattern anomalies */
  orders: {
    /** Z-score threshold for large-order detection (default 2.0) */
    largeOrderZScore: number;
    /** Multiplier over weekly average to flag high frequency (default 3.0) */
    highFrequencyMultiplier: number;
    /** Window in hours within which duplicate orders are checked (default 24) */
    duplicateWindowHours: number;
    /** Lookback days for calculating order baselines (default 90) */
    baselineLookbackDays: number;
  };
  /** Thresholds for inventory anomalies */
  inventory: {
    /** Discrepancy rate percent above which supplier is flagged (default 10) */
    discrepancyRateThreshold: number;
    /** Days without receipt after which inventory is considered stale (default 90) */
    staleDaysThreshold: number;
    /** Percent deviation from expected qty that triggers receipt anomaly (default 25) */
    receiptQtyDeviationPercent: number;
  };
}

/** Union type of all anomaly interfaces */
export type AnyAnomaly =
  | PricingAnomaly
  | PriceChangeAnomaly
  | OrderAnomaly
  | InventoryAnomaly;
