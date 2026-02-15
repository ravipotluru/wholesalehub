import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { ExtractedLineItem } from './validation-loop';

// ─── Types ───

/** Result of resolving a supplier name against the wholesalers table */
export interface SupplierResolution {
  wholesalerId?: string;
  wholesalerDbId?: string;
  matchedName?: string;
  confidence: number;
  matched: boolean;
}

/** A resolved line item with product match information */
export interface ResolvedLineItem {
  originalIndex: number;
  sku: string | null | undefined;
  upc: string | null | undefined;
  productDescription: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  productId?: string;
  matchedSku?: string;
  matchedName?: string;
  confidence: number;
  matched: boolean;
  matchMethod?: 'sku' | 'upc' | 'barcode' | 'name_fuzzy';
}

/** Complete entity resolution result */
export interface EntityResolutionResult {
  supplier: SupplierResolution;
  lineItems: ResolvedLineItem[];
  overallConfidence: number;
}

// ─── Levenshtein Distance ───

/**
 * Calculates the Levenshtein edit distance between two strings.
 * Used for fuzzy string matching of supplier names and product descriptions.
 *
 * @param a - First string
 * @param b - Second string
 * @returns The minimum number of single-character edits to transform a into b
 */
function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  // Create distance matrix
  const matrix: number[][] = Array.from({ length: aLen + 1 }, () =>
    Array.from({ length: bLen + 1 }, () => 0),
  );

  // Initialize first column and first row
  for (let i = 0; i <= aLen; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= bLen; j++) {
    matrix[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[aLen][bLen];
}

/**
 * Calculates a normalized similarity score between two strings (0-1).
 *
 * @param a - First string
 * @param b - Second string
 * @returns Similarity score where 1.0 is an exact match
 */
function stringSimilarity(a: string, b: string): number {
  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  if (normalizedA === normalizedB) return 1.0;
  if (normalizedA.length === 0 || normalizedB.length === 0) return 0.0;

  const distance = levenshteinDistance(normalizedA, normalizedB);
  const maxLen = Math.max(normalizedA.length, normalizedB.length);

  return 1.0 - distance / maxLen;
}

/**
 * Checks if one string contains the other as a significant substring.
 * Useful for matching abbreviated names (e.g., "Pacific Smoke" in "Pacific Smoke Distributors Inc.").
 *
 * @param candidate - The candidate string (from DB)
 * @param query - The search string (from extraction)
 * @returns Containment score 0.0 - 0.9
 */
function containmentScore(candidate: string, query: string): number {
  const normalizedCandidate = candidate.toLowerCase().trim();
  const normalizedQuery = query.toLowerCase().trim();

  if (normalizedCandidate.includes(normalizedQuery)) {
    return 0.85 * (normalizedQuery.length / normalizedCandidate.length) + 0.15;
  }

  if (normalizedQuery.includes(normalizedCandidate)) {
    return 0.85 * (normalizedCandidate.length / normalizedQuery.length) + 0.15;
  }

  return 0;
}

// ─── Supplier Resolution ───

/**
 * Fuzzy-matches a supplier name from an extracted document against the
 * wholesalers table in the database.
 *
 * Matching strategy:
 * 1. Exact match (case-insensitive) on name or businessName
 * 2. Containment match (one name contains the other)
 * 3. Levenshtein similarity match (threshold >= 0.7)
 *
 * @param supplierName - The supplier name extracted from the document
 * @returns Resolution result with match status, confidence, and wholesaler ID
 */
export async function resolveSupplier(
  supplierName: string,
): Promise<SupplierResolution> {
  const startTime = Date.now();

  logger.info({
    event: 'supplier_resolution_start',
    supplierName,
  });

  try {
    // Fetch all active wholesalers for matching
    const wholesalers = await prisma.wholesaler.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        wholesalerId: true,
        name: true,
        businessName: true,
      },
    });

    if (wholesalers.length === 0) {
      logger.warn({ event: 'supplier_resolution_no_wholesalers' });
      return { confidence: 0, matched: false };
    }

    let bestMatch: {
      wholesaler: typeof wholesalers[0];
      score: number;
    } | null = null;

    for (const ws of wholesalers) {
      // Check exact match (case-insensitive)
      const nameLower = ws.name.toLowerCase();
      const businessLower = ws.businessName.toLowerCase();
      const queryLower = supplierName.toLowerCase().trim();

      if (nameLower === queryLower || businessLower === queryLower) {
        bestMatch = { wholesaler: ws, score: 1.0 };
        break;
      }

      // Check containment
      const nameContainment = containmentScore(ws.name, supplierName);
      const businessContainment = containmentScore(ws.businessName, supplierName);
      const maxContainment = Math.max(nameContainment, businessContainment);

      // Check Levenshtein similarity
      const nameSimilarity = stringSimilarity(ws.name, supplierName);
      const businessSimilarity = stringSimilarity(ws.businessName, supplierName);
      const maxSimilarity = Math.max(nameSimilarity, businessSimilarity);

      // Take the best of containment and similarity
      const overallScore = Math.max(maxContainment, maxSimilarity);

      if (overallScore > (bestMatch?.score ?? 0)) {
        bestMatch = { wholesaler: ws, score: overallScore };
      }
    }

    const duration = Date.now() - startTime;

    // Match threshold: 0.7 for a "match"
    if (bestMatch && bestMatch.score >= 0.7) {
      const confidence = Math.round(bestMatch.score * 100) / 100;

      logger.info({
        event: 'supplier_resolution_matched',
        supplierName,
        matchedName: bestMatch.wholesaler.name,
        wholesalerId: bestMatch.wholesaler.wholesalerId,
        confidence,
        durationMs: duration,
      });

      return {
        wholesalerId: bestMatch.wholesaler.wholesalerId,
        wholesalerDbId: bestMatch.wholesaler.id,
        matchedName: bestMatch.wholesaler.name,
        confidence,
        matched: true,
      };
    }

    logger.info({
      event: 'supplier_resolution_no_match',
      supplierName,
      bestScore: bestMatch?.score ?? 0,
      durationMs: duration,
    });

    return {
      confidence: bestMatch ? Math.round(bestMatch.score * 100) / 100 : 0,
      matched: false,
    };
  } catch (error) {
    logger.error({
      event: 'supplier_resolution_error',
      supplierName,
      error: (error as Error).message,
    });

    return { confidence: 0, matched: false };
  }
}

// ─── Product Resolution ───

/**
 * Resolves extracted line items against the products and product_barcodes tables.
 *
 * Matching strategy per line item (in priority order):
 * 1. SKU exact match on products.sku
 * 2. UPC exact match on products.upcCode
 * 3. UPC/barcode match on product_barcodes.barcode
 * 4. Fuzzy match on product name/description (Levenshtein, threshold >= 0.65)
 *
 * @param lineItems - Array of extracted line items to resolve
 * @returns Array of resolved line items with product match information
 */
export async function resolveProducts(
  lineItems: ExtractedLineItem[],
): Promise<ResolvedLineItem[]> {
  const startTime = Date.now();

  logger.info({
    event: 'product_resolution_start',
    lineItemCount: lineItems.length,
  });

  const resolved: ResolvedLineItem[] = [];

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    let matchResult: ResolvedLineItem = {
      originalIndex: i,
      sku: item.sku,
      upc: item.upc,
      productDescription: item.product_description,
      quantity: item.quantity,
      unitCost: item.unit_cost,
      lineTotal: item.line_total,
      confidence: 0,
      matched: false,
    };

    try {
      // Strategy 1: Match by SKU
      if (item.sku) {
        const skuMatch = await prisma.product.findFirst({
          where: {
            sku: { equals: item.sku, mode: 'insensitive' },
            status: 'ACTIVE',
          },
          select: { id: true, sku: true, name: true },
        });

        if (skuMatch) {
          matchResult = {
            ...matchResult,
            productId: skuMatch.id,
            matchedSku: skuMatch.sku,
            matchedName: skuMatch.name,
            confidence: 0.98,
            matched: true,
            matchMethod: 'sku',
          };
          resolved.push(matchResult);
          continue;
        }
      }

      // Strategy 2: Match by UPC on Product.upcCode
      if (item.upc) {
        const upcMatch = await prisma.product.findFirst({
          where: {
            upcCode: item.upc,
            status: 'ACTIVE',
          },
          select: { id: true, sku: true, name: true },
        });

        if (upcMatch) {
          matchResult = {
            ...matchResult,
            productId: upcMatch.id,
            matchedSku: upcMatch.sku,
            matchedName: upcMatch.name,
            confidence: 0.95,
            matched: true,
            matchMethod: 'upc',
          };
          resolved.push(matchResult);
          continue;
        }

        // Strategy 3: Match by UPC on ProductBarcode table
        const barcodeMatch = await prisma.productBarcode.findFirst({
          where: { barcode: item.upc },
          include: {
            product: {
              select: { id: true, sku: true, name: true, status: true },
            },
          },
        });

        if (barcodeMatch && barcodeMatch.product.status === 'ACTIVE') {
          matchResult = {
            ...matchResult,
            productId: barcodeMatch.product.id,
            matchedSku: barcodeMatch.product.sku,
            matchedName: barcodeMatch.product.name,
            confidence: 0.93,
            matched: true,
            matchMethod: 'barcode',
          };
          resolved.push(matchResult);
          continue;
        }
      }

      // Strategy 4: Fuzzy match on product name/description
      const products = await prisma.product.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, sku: true, name: true, description: true },
        take: 500, // limit for performance
      });

      let bestFuzzyMatch: {
        product: typeof products[0];
        score: number;
      } | null = null;

      for (const product of products) {
        const nameSim = stringSimilarity(product.name, item.product_description);
        const descSim = product.description
          ? stringSimilarity(product.description, item.product_description)
          : 0;
        const bestSim = Math.max(nameSim, descSim);

        if (bestSim > (bestFuzzyMatch?.score ?? 0)) {
          bestFuzzyMatch = { product, score: bestSim };
        }
      }

      if (bestFuzzyMatch && bestFuzzyMatch.score >= 0.65) {
        matchResult = {
          ...matchResult,
          productId: bestFuzzyMatch.product.id,
          matchedSku: bestFuzzyMatch.product.sku,
          matchedName: bestFuzzyMatch.product.name,
          confidence: Math.round(bestFuzzyMatch.score * 100) / 100,
          matched: true,
          matchMethod: 'name_fuzzy',
        };
      }
    } catch (error) {
      logger.error({
        event: 'product_resolution_item_error',
        index: i,
        sku: item.sku,
        error: (error as Error).message,
      });
    }

    resolved.push(matchResult);
  }

  const matchedCount = resolved.filter((r) => r.matched).length;
  const duration = Date.now() - startTime;

  logger.info({
    event: 'product_resolution_complete',
    total: lineItems.length,
    matched: matchedCount,
    unmatched: lineItems.length - matchedCount,
    durationMs: duration,
  });

  return resolved;
}
