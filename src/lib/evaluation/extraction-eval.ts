/**
 * Extraction Accuracy Evaluation Module
 *
 * Evaluates the WholesaleHub document extraction pipeline by comparing
 * AI-extracted structured data against ground-truth annotations.
 *
 * Measures overall accuracy, per-field accuracy, auto-accept accuracy
 * (HIGH confidence results that were actually correct), average corrections
 * needed, and field completeness.
 *
 * @module evaluation/extraction-eval
 */

import { logger } from '@/lib/logger';
import { extractWithValidation } from '@/lib/ai/validation-loop';
import type {
  ExtractionEvalCase,
  ExtractionEvalMetrics,
  ExtractionDocumentResult,
  ExtractionGroundTruth,
  FieldMatchResult,
} from './types';

// ─── Utility Functions ───

/**
 * Deep equality check for two values.
 * Handles primitives, arrays, objects, null, and undefined.
 * Uses a tolerance of 0.01 for number comparisons to account
 * for floating point rounding in financial data.
 *
 * @param a - First value
 * @param b - Second value
 * @returns Whether the two values are deeply equal
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Handle null / undefined
  if (a === null && b === null) return true;
  if (a === undefined && b === undefined) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    // Treat null and undefined as equivalent for optional fields
    return (a === null || a === undefined) && (b === null || b === undefined);
  }

  // Numbers: tolerance-based comparison
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 0.01;
  }

  // Strings: case-insensitive trim comparison
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  // Booleans
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b;
  }

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Objects
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    // Check all keys in a exist in b with same values
    for (const key of aKeys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    // Check b doesn't have extra non-null keys
    for (const key of bKeys) {
      if (!(key in aObj) && bObj[key] !== null && bObj[key] !== undefined) {
        return false;
      }
    }
    return true;
  }

  // Fallback: strict equality
  return a === b;
}

/**
 * Retrieves a nested value from an object using a dot-separated path.
 *
 * @param obj - The object to traverse
 * @param path - Dot-separated path (e.g. "line_items.0.sku")
 * @returns The value at the path, or undefined if not found
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    if (typeof current === 'object') {
      // Handle array index access
      const index = Number(part);
      if (Array.isArray(current) && !isNaN(index)) {
        current = current[index];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    } else {
      return undefined;
    }
  }

  return current;
}

// ─── Field Comparison ───

/** Fields to evaluate at the top (header) level */
const HEADER_FIELDS = [
  'supplier_name',
  'document_type',
  'document_number',
  'po_reference',
  'ship_date',
  'carrier',
  'tracking_number',
] as const;

/** Fields to evaluate at the totals level */
const TOTALS_FIELDS = ['subtotal', 'tax', 'total'] as const;

/** Fields to evaluate per line item */
const LINE_ITEM_FIELDS = [
  'sku',
  'upc',
  'product_description',
  'quantity',
  'unit_cost',
  'line_total',
] as const;

/**
 * Compares extracted data against ground truth and produces per-field results.
 *
 * @param actual - The extracted data (or null if extraction failed)
 * @param expected - The ground truth data
 * @returns Record mapping field paths to match results
 */
function compareFields(
  actual: Record<string, unknown> | null,
  expected: ExtractionGroundTruth,
): Record<string, FieldMatchResult> {
  const results: Record<string, FieldMatchResult> = {};

  // Header fields
  for (const field of HEADER_FIELDS) {
    const expectedVal = getNestedValue(expected, field);
    const actualVal = actual ? getNestedValue(actual, field) : undefined;
    results[field] = {
      field,
      matched: deepEqual(actualVal, expectedVal),
      expected: expectedVal,
      actual: actualVal,
    };
  }

  // Totals fields
  for (const field of TOTALS_FIELDS) {
    const expectedVal = getNestedValue(expected, field);
    const actualVal = actual ? getNestedValue(actual, field) : undefined;
    results[field] = {
      field,
      matched: deepEqual(actualVal, expectedVal),
      expected: expectedVal,
      actual: actualVal,
    };
  }

  // Line items count
  const expectedLineCount = expected.line_items.length;
  const actualLineCount = actual
    ? (getNestedValue(actual, 'line_items') as unknown[] | undefined)?.length ?? 0
    : 0;
  results['line_items_count'] = {
    field: 'line_items_count',
    matched: expectedLineCount === actualLineCount,
    expected: expectedLineCount,
    actual: actualLineCount,
  };

  // Per line item fields (up to expected count)
  for (let i = 0; i < expected.line_items.length; i++) {
    for (const field of LINE_ITEM_FIELDS) {
      const path = `line_items.${i}.${field}`;
      const expectedVal = getNestedValue(expected, path);
      const actualVal = actual ? getNestedValue(actual, path) : undefined;
      results[path] = {
        field: path,
        matched: deepEqual(actualVal, expectedVal),
        expected: expectedVal,
        actual: actualVal,
      };
    }
  }

  return results;
}

// ─── Main Evaluation Function ───

/**
 * Runs the full extraction accuracy evaluation across all test cases.
 *
 * For each test case, runs the extraction pipeline (with validation loop)
 * and compares the output against ground truth. Aggregates results into
 * overall accuracy, per-field accuracy, auto-accept accuracy, average
 * corrections needed, and completeness.
 *
 * @param testCases - Array of extraction evaluation test cases
 * @returns Aggregated extraction evaluation metrics
 */
export async function evaluateExtraction(
  testCases: ExtractionEvalCase[],
): Promise<ExtractionEvalMetrics> {
  logger.info({
    event: 'extraction_eval_start',
    totalCases: testCases.length,
  });

  const perDocumentResults: ExtractionDocumentResult[] = [];
  const fieldAccuracyCounters: Record<string, { correct: number; total: number }> = {};

  let totalCorrect = 0;
  let totalCorrections = 0;
  let totalHighConfidence = 0;
  let totalHighConfidenceCorrect = 0;
  let totalFieldsExtracted = 0;
  let totalFieldsPossible = 0;
  let totalTruePositives = 0;
  let totalFalsePositives = 0;
  let totalFalseNegatives = 0;

  for (let caseIdx = 0; caseIdx < testCases.length; caseIdx++) {
    const testCase = testCases[caseIdx];

    // Run extraction
    const result = await extractWithValidation(testCase.documentText, 3);
    const actualData = result.success && result.data
      ? (result.data as unknown as Record<string, unknown>)
      : null;

    // Compare fields
    const fieldResults = compareFields(actualData, testCase.groundTruth);

    // Determine overall correctness (all critical fields match)
    const criticalFields = [
      'supplier_name',
      'document_number',
      'total',
      'line_items_count',
    ];
    const isCorrect = criticalFields.every(
      (f) => fieldResults[f]?.matched === true,
    );

    if (isCorrect) totalCorrect++;

    // Count corrections needed
    const correctionsNeeded = result.attempts - 1;
    totalCorrections += correctionsNeeded;

    // Check auto-accept (all confidence HIGH)
    const wasHighConfidence =
      result.success &&
      result.data !== undefined &&
      result.data.confidence.header === 'HIGH' &&
      result.data.confidence.line_items === 'HIGH' &&
      result.data.confidence.totals === 'HIGH';

    if (wasHighConfidence) {
      totalHighConfidence++;
      if (isCorrect) totalHighConfidenceCorrect++;
    }

    // Aggregate per-field accuracy
    for (const [fieldPath, fieldResult] of Object.entries(fieldResults)) {
      if (!fieldAccuracyCounters[fieldPath]) {
        fieldAccuracyCounters[fieldPath] = { correct: 0, total: 0 };
      }
      fieldAccuracyCounters[fieldPath].total++;
      if (fieldResult.matched) {
        fieldAccuracyCounters[fieldPath].correct++;
      }
    }

    // Completeness: count non-null actual values
    for (const fieldResult of Object.values(fieldResults)) {
      totalFieldsPossible++;
      if (
        fieldResult.actual !== null &&
        fieldResult.actual !== undefined
      ) {
        totalFieldsExtracted++;
      }
    }

    // Precision/recall accounting per field
    for (const fieldResult of Object.values(fieldResults)) {
      if (fieldResult.matched) {
        totalTruePositives++;
      } else if (
        fieldResult.actual !== null &&
        fieldResult.actual !== undefined &&
        !fieldResult.matched
      ) {
        totalFalsePositives++;
      }
      if (
        !fieldResult.matched &&
        fieldResult.expected !== null &&
        fieldResult.expected !== undefined
      ) {
        totalFalseNegatives++;
      }
    }

    perDocumentResults.push({
      caseIndex: caseIdx,
      isCorrect,
      fieldResults,
      correctionsNeeded,
      wasHighConfidence,
    });
  }

  const totalSamples = testCases.length;
  const accuracy = totalSamples > 0 ? totalCorrect / totalSamples : 0;

  const precision =
    totalTruePositives + totalFalsePositives > 0
      ? totalTruePositives / (totalTruePositives + totalFalsePositives)
      : 0;

  const recall =
    totalTruePositives + totalFalseNegatives > 0
      ? totalTruePositives / (totalTruePositives + totalFalseNegatives)
      : 0;

  const f1Score =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  const falsePositiveRate =
    totalTruePositives + totalFalsePositives > 0
      ? totalFalsePositives / (totalTruePositives + totalFalsePositives)
      : 0;

  const falseNegativeRate =
    totalTruePositives + totalFalseNegatives > 0
      ? totalFalseNegatives / (totalTruePositives + totalFalseNegatives)
      : 0;

  // Per-field accuracy
  const perFieldAccuracy: Record<string, number> = {};
  for (const [field, counter] of Object.entries(fieldAccuracyCounters)) {
    perFieldAccuracy[field] =
      counter.total > 0 ? counter.correct / counter.total : 0;
  }

  const autoAcceptAccuracy =
    totalHighConfidence > 0
      ? totalHighConfidenceCorrect / totalHighConfidence
      : 0;

  const avgCorrectionsNeeded =
    totalSamples > 0 ? totalCorrections / totalSamples : 0;

  const completeness =
    totalFieldsPossible > 0 ? totalFieldsExtracted / totalFieldsPossible : 0;

  const metrics: ExtractionEvalMetrics = {
    accuracy,
    precision,
    recall,
    f1Score,
    falsePositiveRate,
    falseNegativeRate,
    totalSamples,
    perFieldAccuracy,
    autoAcceptAccuracy,
    avgCorrectionsNeeded,
    completeness,
    perDocumentResults,
  };

  logger.info({
    event: 'extraction_eval_complete',
    totalSamples,
    accuracy: Math.round(accuracy * 10000) / 10000,
    autoAcceptAccuracy: Math.round(autoAcceptAccuracy * 10000) / 10000,
    avgCorrectionsNeeded: Math.round(avgCorrectionsNeeded * 100) / 100,
    completeness: Math.round(completeness * 10000) / 10000,
  });

  return metrics;
}

// ─── Default Test Cases ───

/**
 * Returns 12 hardcoded extraction test cases with ground truth.
 *
 * Covers:
 * - Simple invoices with 2-3 line items
 * - Complex invoices with 5+ line items
 * - ASN documents with tracking/carrier info
 * - PO confirmations
 * - Messy/informal documents
 * - Documents with missing optional fields
 *
 * @returns Array of 12 extraction evaluation test cases
 */
export function getDefaultExtractionTestCases(): ExtractionEvalCase[] {
  return [
    // ── Case 1: Simple invoice with 3 line items ──
    {
      documentText: `
INVOICE
From: Premium Vape Distributors
Invoice #: INV-2024-001
PO Reference: PO-7890
Date: 2024-11-15

Item                          Qty    Unit Cost    Total
-----------------------------------------------------------
Disposable Vape Pen 5000     100     $8.50       $850.00
Rolling Papers King Size      200     $1.25       $250.00
Glass Pipe 4-inch              50     $4.00       $200.00

Subtotal: $1,300.00
Tax (8%):    $104.00
Total:    $1,404.00
      `.trim(),
      groundTruth: {
        supplier_name: 'Premium Vape Distributors',
        document_type: 'INVOICE',
        document_number: 'INV-2024-001',
        po_reference: 'PO-7890',
        ship_date: null,
        carrier: null,
        tracking_number: null,
        line_items: [
          {
            sku: null,
            upc: null,
            product_description: 'Disposable Vape Pen 5000',
            quantity: 100,
            unit_cost: 8.50,
            line_total: 850.00,
          },
          {
            sku: null,
            upc: null,
            product_description: 'Rolling Papers King Size',
            quantity: 200,
            unit_cost: 1.25,
            line_total: 250.00,
          },
          {
            sku: null,
            upc: null,
            product_description: 'Glass Pipe 4-inch',
            quantity: 50,
            unit_cost: 4.00,
            line_total: 200.00,
          },
        ],
        subtotal: 1300.00,
        tax: 104.00,
        total: 1404.00,
        confidence: { header: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
      },
    },

    // ── Case 2: Complex invoice with 6 line items ──
    {
      documentText: `
WHOLESALE INVOICE

Supplier: SmokeCity Wholesale LLC
Invoice Number: SC-88721
PO#: PO-2024-456
Invoice Date: 2024-12-01

SKU        Description                    UPC            Qty    Price     Extended
---------------------------------------------------------------------------------
SKU-V100   Disposable Vape Berry Blast    012345678901   500    $7.99    $3,995.00
SKU-V101   Disposable Vape Mango Ice      012345678902   500    $7.99    $3,995.00
SKU-G200   Glass Beaker Bong 12"          012345678903    25   $24.99      $624.75
SKU-R300   Organic Hemp Wraps 6pk         012345678904   300    $2.49      $747.00
SKU-A400   4-Piece Aluminum Grinder       012345678905   100    $6.99      $699.00
SKU-C500   Isopropyl Cleaning Solution    012345678906   200    $3.49      $698.00

Subtotal:  $10,758.75
Sales Tax:    $860.70
TOTAL DUE: $11,619.45

Payment Terms: NET30
      `.trim(),
      groundTruth: {
        supplier_name: 'SmokeCity Wholesale LLC',
        document_type: 'INVOICE',
        document_number: 'SC-88721',
        po_reference: 'PO-2024-456',
        ship_date: null,
        carrier: null,
        tracking_number: null,
        line_items: [
          { sku: 'SKU-V100', upc: '012345678901', product_description: 'Disposable Vape Berry Blast', quantity: 500, unit_cost: 7.99, line_total: 3995.00 },
          { sku: 'SKU-V101', upc: '012345678902', product_description: 'Disposable Vape Mango Ice', quantity: 500, unit_cost: 7.99, line_total: 3995.00 },
          { sku: 'SKU-G200', upc: '012345678903', product_description: 'Glass Beaker Bong 12"', quantity: 25, unit_cost: 24.99, line_total: 624.75 },
          { sku: 'SKU-R300', upc: '012345678904', product_description: 'Organic Hemp Wraps 6pk', quantity: 300, unit_cost: 2.49, line_total: 747.00 },
          { sku: 'SKU-A400', upc: '012345678905', product_description: '4-Piece Aluminum Grinder', quantity: 100, unit_cost: 6.99, line_total: 699.00 },
          { sku: 'SKU-C500', upc: '012345678906', product_description: 'Isopropyl Cleaning Solution', quantity: 200, unit_cost: 3.49, line_total: 698.00 },
        ],
        subtotal: 10758.75,
        tax: 860.70,
        total: 11619.45,
        confidence: { header: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
      },
    },

    // ── Case 3: ASN with tracking info ──
    {
      documentText: `
ADVANCE SHIPMENT NOTICE

From: Pacific Smoke Distributors
ASN#: ASN-2024-3391
PO Reference: PO-1122
Ship Date: 2024-12-05
Carrier: FedEx Ground
Tracking: 794644790132

Items Shipping:
1. Disposable Vape Pen (Mixed Flavors) x 200 @ $8.00 = $1,600.00
2. CBD Gummies 30ct x 100 @ $12.50 = $1,250.00
3. Torch Lighter (Butane) x 150 @ $3.25 = $487.50

Subtotal: $3,337.50
Tax: $267.00
Total: $3,604.50

Expected Delivery: 2024-12-10
      `.trim(),
      groundTruth: {
        supplier_name: 'Pacific Smoke Distributors',
        document_type: 'ASN',
        document_number: 'ASN-2024-3391',
        po_reference: 'PO-1122',
        ship_date: '2024-12-05',
        carrier: 'FedEx Ground',
        tracking_number: '794644790132',
        line_items: [
          { sku: null, upc: null, product_description: 'Disposable Vape Pen (Mixed Flavors)', quantity: 200, unit_cost: 8.00, line_total: 1600.00 },
          { sku: null, upc: null, product_description: 'CBD Gummies 30ct', quantity: 100, unit_cost: 12.50, line_total: 1250.00 },
          { sku: null, upc: null, product_description: 'Torch Lighter (Butane)', quantity: 150, unit_cost: 3.25, line_total: 487.50 },
        ],
        subtotal: 3337.50,
        tax: 267.00,
        total: 3604.50,
        confidence: { header: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
      },
    },

    // ── Case 4: PO Confirmation ──
    {
      documentText: `
PURCHASE ORDER CONFIRMATION

Supplier: Green Leaf Wholesale
Confirmation Number: POC-55123
Original PO: PO-9988
Date: 2024-11-28

We confirm the following order:

SKU       Item                          Qty   Unit Price    Amount
-----------------------------------------------------------------
GL-001    Hemp Rolling Papers 1-1/4     400     $0.89      $356.00
GL-002    Pre-rolled Cones 6pk          250     $1.99      $497.50

Subtotal: $853.50
Tax:       $68.28
Total:    $921.78

Expected ship date: 2024-12-02
Via: UPS Ground
      `.trim(),
      groundTruth: {
        supplier_name: 'Green Leaf Wholesale',
        document_type: 'PO_CONFIRMATION',
        document_number: 'POC-55123',
        po_reference: 'PO-9988',
        ship_date: '2024-12-02',
        carrier: 'UPS Ground',
        tracking_number: null,
        line_items: [
          { sku: 'GL-001', upc: null, product_description: 'Hemp Rolling Papers 1-1/4', quantity: 400, unit_cost: 0.89, line_total: 356.00 },
          { sku: 'GL-002', upc: null, product_description: 'Pre-rolled Cones 6pk', quantity: 250, unit_cost: 1.99, line_total: 497.50 },
        ],
        subtotal: 853.50,
        tax: 68.28,
        total: 921.78,
        confidence: { header: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
      },
    },

    // ── Case 5: Messy / informal document ──
    {
      documentText: `
hey here's your invoice

from quickship tobacco
inv# QST-77
po: 4455

stuff:
- 50x glass pipes small $3 each = $150
- 25x bongs medium $18 each = $450
- 10x dab rigs $35 each = $350

sub: $950
tax: $76
total: $1026
      `.trim(),
      groundTruth: {
        supplier_name: 'quickship tobacco',
        document_type: 'INVOICE',
        document_number: 'QST-77',
        po_reference: '4455',
        ship_date: null,
        carrier: null,
        tracking_number: null,
        line_items: [
          { sku: null, upc: null, product_description: 'glass pipes small', quantity: 50, unit_cost: 3.00, line_total: 150.00 },
          { sku: null, upc: null, product_description: 'bongs medium', quantity: 25, unit_cost: 18.00, line_total: 450.00 },
          { sku: null, upc: null, product_description: 'dab rigs', quantity: 10, unit_cost: 35.00, line_total: 350.00 },
        ],
        subtotal: 950.00,
        tax: 76.00,
        total: 1026.00,
        confidence: { header: 'MEDIUM', line_items: 'MEDIUM', totals: 'HIGH' },
      },
    },

    // ── Case 6: Single line item invoice ──
    {
      documentText: `
INVOICE

Supplier: Delta Wholesale Corp
Invoice Number: DW-2024-112
PO: PO-6677

1x Pallet Delta-8 Cartridges (500 units) @ $5.50/unit = $2,750.00

Subtotal: $2,750.00
Tax: $220.00
Total: $2,970.00
      `.trim(),
      groundTruth: {
        supplier_name: 'Delta Wholesale Corp',
        document_type: 'INVOICE',
        document_number: 'DW-2024-112',
        po_reference: 'PO-6677',
        ship_date: null,
        carrier: null,
        tracking_number: null,
        line_items: [
          { sku: null, upc: null, product_description: 'Pallet Delta-8 Cartridges', quantity: 500, unit_cost: 5.50, line_total: 2750.00 },
        ],
        subtotal: 2750.00,
        tax: 220.00,
        total: 2970.00,
        confidence: { header: 'HIGH', line_items: 'MEDIUM', totals: 'HIGH' },
      },
    },

    // ── Case 7: Invoice with promotional pricing ──
    {
      documentText: `
WHOLESALE INVOICE

BlazeUp Distributors Inc.
Invoice: BU-44892
Reference PO: PO-3344
Date: 2024-12-10

SKU        Product                        Qty    Unit     Total
---------------------------------------------------------------
BU-LIG01   Refillable Lighter Asst       1000    $1.10   $1,100.00
BU-GRD02   Herb Grinder 2" (PROMO)        200    $4.50     $900.00
BU-WRP03   Cigar Wraps Variety 2pk         500    $0.79     $395.00
BU-CLN04   Glass Cleaner 8oz              300    $2.99     $897.00

Subtotal: $3,292.00
Tax (7.5%): $246.90
Grand Total: $3,538.90
      `.trim(),
      groundTruth: {
        supplier_name: 'BlazeUp Distributors Inc.',
        document_type: 'INVOICE',
        document_number: 'BU-44892',
        po_reference: 'PO-3344',
        ship_date: null,
        carrier: null,
        tracking_number: null,
        line_items: [
          { sku: 'BU-LIG01', upc: null, product_description: 'Refillable Lighter Asst', quantity: 1000, unit_cost: 1.10, line_total: 1100.00 },
          { sku: 'BU-GRD02', upc: null, product_description: 'Herb Grinder 2" (PROMO)', quantity: 200, unit_cost: 4.50, line_total: 900.00 },
          { sku: 'BU-WRP03', upc: null, product_description: 'Cigar Wraps Variety 2pk', quantity: 500, unit_cost: 0.79, line_total: 395.00 },
          { sku: 'BU-CLN04', upc: null, product_description: 'Glass Cleaner 8oz', quantity: 300, unit_cost: 2.99, line_total: 897.00 },
        ],
        subtotal: 3292.00,
        tax: 246.90,
        total: 3538.90,
        confidence: { header: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
      },
    },

    // ── Case 8: ASN with multiple tracking numbers ──
    {
      documentText: `
ASN - Advance Shipping Notice

Shipper: CloudNine Wholesale
ASN Number: CN-ASN-8821
PO: PO-5599
Shipped: 2024-12-08
Carrier: USPS Priority
Tracking #: 9405511899223456789012

Contents:
1) E-Liquid Strawberry 30ml   x 400   @ $3.25   $1,300.00
2) Vape Coils 5-pack          x 200   @ $4.99     $998.00

Subtotal: $2,298.00
Tax: $183.84
Total: $2,481.84
      `.trim(),
      groundTruth: {
        supplier_name: 'CloudNine Wholesale',
        document_type: 'ASN',
        document_number: 'CN-ASN-8821',
        po_reference: 'PO-5599',
        ship_date: '2024-12-08',
        carrier: 'USPS Priority',
        tracking_number: '9405511899223456789012',
        line_items: [
          { sku: null, upc: null, product_description: 'E-Liquid Strawberry 30ml', quantity: 400, unit_cost: 3.25, line_total: 1300.00 },
          { sku: null, upc: null, product_description: 'Vape Coils 5-pack', quantity: 200, unit_cost: 4.99, line_total: 998.00 },
        ],
        subtotal: 2298.00,
        tax: 183.84,
        total: 2481.84,
        confidence: { header: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
      },
    },

    // ── Case 9: Invoice with missing optional fields ──
    {
      documentText: `
Invoice from AllSmoke Distributors
#AS-10042

2 items:
Silicone Pipe Assorted Colors, 75 pcs, $2.80 each, $210.00
Smell-proof Bag Large, 120 pcs, $1.50 each, $180.00

Subtotal $390.00
No tax
Total $390.00
      `.trim(),
      groundTruth: {
        supplier_name: 'AllSmoke Distributors',
        document_type: 'INVOICE',
        document_number: 'AS-10042',
        po_reference: null,
        ship_date: null,
        carrier: null,
        tracking_number: null,
        line_items: [
          { sku: null, upc: null, product_description: 'Silicone Pipe Assorted Colors', quantity: 75, unit_cost: 2.80, line_total: 210.00 },
          { sku: null, upc: null, product_description: 'Smell-proof Bag Large', quantity: 120, unit_cost: 1.50, line_total: 180.00 },
        ],
        subtotal: 390.00,
        tax: 0,
        total: 390.00,
        confidence: { header: 'MEDIUM', line_items: 'HIGH', totals: 'HIGH' },
      },
    },

    // ── Case 10: Large invoice with 10+ items ──
    {
      documentText: `
MEGA WHOLESALE INVOICE

From: National Smoke Supply Co.
Invoice: NSS-2024-9001
PO: PO-MEGA-001
Date: 2024-12-12

SKU         Product                              Qty    Cost     Total
----------------------------------------------------------------------
NSS-001     Disposable Vape Pen Strawberry       200    $7.50   $1,500.00
NSS-002     Disposable Vape Pen Blueberry        200    $7.50   $1,500.00
NSS-003     Disposable Vape Pen Watermelon       200    $7.50   $1,500.00
NSS-004     Glass Bong 14" Premium                30   $29.99     $899.70
NSS-005     Rolling Papers Raw Classic           500    $0.99     $495.00
NSS-006     Pre-roll Cones King Size 3pk         400    $1.49     $596.00
NSS-007     Metal Grinder 4-piece 55mm           150    $5.99     $898.50
NSS-008     Butane Torch Lighter                 300    $2.75     $825.00
NSS-009     Pipe Cleaning Kit                    100    $4.25     $425.00
NSS-010     CBD Tincture 500mg                    80   $15.00   $1,200.00
NSS-011     Incense Sticks Variety 20pk          250    $1.99     $497.50

Subtotal: $10,336.70
Tax (8.25%): $852.78
Invoice Total: $11,189.48
      `.trim(),
      groundTruth: {
        supplier_name: 'National Smoke Supply Co.',
        document_type: 'INVOICE',
        document_number: 'NSS-2024-9001',
        po_reference: 'PO-MEGA-001',
        ship_date: null,
        carrier: null,
        tracking_number: null,
        line_items: [
          { sku: 'NSS-001', upc: null, product_description: 'Disposable Vape Pen Strawberry', quantity: 200, unit_cost: 7.50, line_total: 1500.00 },
          { sku: 'NSS-002', upc: null, product_description: 'Disposable Vape Pen Blueberry', quantity: 200, unit_cost: 7.50, line_total: 1500.00 },
          { sku: 'NSS-003', upc: null, product_description: 'Disposable Vape Pen Watermelon', quantity: 200, unit_cost: 7.50, line_total: 1500.00 },
          { sku: 'NSS-004', upc: null, product_description: 'Glass Bong 14" Premium', quantity: 30, unit_cost: 29.99, line_total: 899.70 },
          { sku: 'NSS-005', upc: null, product_description: 'Rolling Papers Raw Classic', quantity: 500, unit_cost: 0.99, line_total: 495.00 },
          { sku: 'NSS-006', upc: null, product_description: 'Pre-roll Cones King Size 3pk', quantity: 400, unit_cost: 1.49, line_total: 596.00 },
          { sku: 'NSS-007', upc: null, product_description: 'Metal Grinder 4-piece 55mm', quantity: 150, unit_cost: 5.99, line_total: 898.50 },
          { sku: 'NSS-008', upc: null, product_description: 'Butane Torch Lighter', quantity: 300, unit_cost: 2.75, line_total: 825.00 },
          { sku: 'NSS-009', upc: null, product_description: 'Pipe Cleaning Kit', quantity: 100, unit_cost: 4.25, line_total: 425.00 },
          { sku: 'NSS-010', upc: null, product_description: 'CBD Tincture 500mg', quantity: 80, unit_cost: 15.00, line_total: 1200.00 },
          { sku: 'NSS-011', upc: null, product_description: 'Incense Sticks Variety 20pk', quantity: 250, unit_cost: 1.99, line_total: 497.50 },
        ],
        subtotal: 10336.70,
        tax: 852.78,
        total: 11189.48,
        confidence: { header: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
      },
    },

    // ── Case 11: PO Confirmation with partial shipment note ──
    {
      documentText: `
PO CONFIRMATION

Supplier: Vape Nation Wholesale
Confirmation #: VNW-CONF-2291
Your PO: PO-8811
Date Confirmed: 2024-12-14

Confirmed Items:
- E-Liquid Tobacco Flavor 60ml (VN-EL60) x 300 @ $4.50 = $1,350.00
- Replacement Coil Pack (VN-RC5) x 500 @ $2.99 = $1,495.00
- USB-C Vape Charger (VN-CHG) x 200 @ $1.75 = $350.00

Subtotal: $3,195.00
Tax: $255.60
Total: $3,450.60

Note: Shipping via FedEx, expected 2024-12-18
      `.trim(),
      groundTruth: {
        supplier_name: 'Vape Nation Wholesale',
        document_type: 'PO_CONFIRMATION',
        document_number: 'VNW-CONF-2291',
        po_reference: 'PO-8811',
        ship_date: '2024-12-18',
        carrier: 'FedEx',
        tracking_number: null,
        line_items: [
          { sku: 'VN-EL60', upc: null, product_description: 'E-Liquid Tobacco Flavor 60ml', quantity: 300, unit_cost: 4.50, line_total: 1350.00 },
          { sku: 'VN-RC5', upc: null, product_description: 'Replacement Coil Pack', quantity: 500, unit_cost: 2.99, line_total: 1495.00 },
          { sku: 'VN-CHG', upc: null, product_description: 'USB-C Vape Charger', quantity: 200, unit_cost: 1.75, line_total: 350.00 },
        ],
        subtotal: 3195.00,
        tax: 255.60,
        total: 3450.60,
        confidence: { header: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
      },
    },

    // ── Case 12: Invoice with discounts / credits ──
    {
      documentText: `
INVOICE

WestCoast Smoke Wholesale
Inv #WCS-6644
PO Ref: PO-2233

Product Listing:
1. Lava Lamp 14" Classic         x 40    @ $12.00   = $480.00
2. Tapestry Wall Hanging 60x80  x 25    @ $8.50    = $212.50

Subtotal: $692.50
Tax: $55.40
Total Due: $747.90
      `.trim(),
      groundTruth: {
        supplier_name: 'WestCoast Smoke Wholesale',
        document_type: 'INVOICE',
        document_number: 'WCS-6644',
        po_reference: 'PO-2233',
        ship_date: null,
        carrier: null,
        tracking_number: null,
        line_items: [
          { sku: null, upc: null, product_description: 'Lava Lamp 14" Classic', quantity: 40, unit_cost: 12.00, line_total: 480.00 },
          { sku: null, upc: null, product_description: 'Tapestry Wall Hanging 60x80', quantity: 25, unit_cost: 8.50, line_total: 212.50 },
        ],
        subtotal: 692.50,
        tax: 55.40,
        total: 747.90,
        confidence: { header: 'HIGH', line_items: 'HIGH', totals: 'HIGH' },
      },
    },
  ];
}
