/**
 * Admin Recall Lookup API
 *
 * GET /api/admin/recall?lot=<lot>
 *
 * Scopes a manufacturer/regulator recall by lot number. Returns every
 * receipt + receipt line that recorded the lot (either at ASN ingest or
 * later from the first scan) plus the candidate downstream orders that
 * consumed those product SKUs.
 *
 * Caveat — order linkage is best-effort: today the schema does not carry
 * lot down to OrderLine, so the response includes orders containing the
 * affected product IDs. Ops will still need to physically inspect the
 * shipments. Once we add lot tracking through OrderLine + reservation,
 * this can become a definitive list.
 *
 * Auth: ADMIN only. Logged as `event: 'recall_lookup'`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';

const recallQuerySchema = z.object({
  lot: z.string().min(1).max(120),
});

interface RecallReceiptLine {
  id: string;
  lineNumber: number;
  sku: string | null;
  productId: string | null;
  productName: string;
  qtyExpected: number;
  qtyReceived: number;
  lotNumber: string | null;
  serialNumber: string | null;
  expirationDate: string | null;
  manufactureDate: string | null;
}

interface RecallReceiptGroup {
  receiptId: string;
  receiptNumber: string;
  supplierId: string | null;
  poNumber: string | null;
  receivedDate: string | null;
  status: string;
  lines: RecallReceiptLine[];
}

interface RecallScanRecord {
  id: string;
  receiptId: string;
  productId: string | null;
  barcode: string;
  scannedQty: number;
  lotNumber: string | null;
  serialNumber: string | null;
  expirationDate: string | null;
  scanTimestamp: string;
}

interface RecallOrderRef {
  orderId: string;
  orderNumber: string;
  retailerId: string;
  wholesalerId: string;
  orderDate: string;
  productId: string;
  productName: string;
  sku: string;
  quantityOrdered: number;
}

interface RecallResponse {
  lot: string;
  totals: {
    receiptCount: number;
    lineCount: number;
    scanCount: number;
    orderCount: number;
  };
  receipts: RecallReceiptGroup[];
  scans: RecallScanRecord[];
  orders: RecallOrderRef[];
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = recallQuerySchema.safeParse({
      lot: searchParams.get('lot') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const { lot } = parsed.data;

    // Find every receipt line and scan that mentions the lot.
    const lineWhere: Prisma.ReceiptLineWhereInput = { lotNumber: lot };
    const scanWhere: Prisma.ReceiptScanWhereInput = { lotNumber: lot };

    const [matchingLines, matchingScans] = await Promise.all([
      prisma.receiptLine.findMany({
        where: lineWhere,
        include: {
          receipt: {
            select: {
              id: true,
              receiptNumber: true,
              supplierId: true,
              poNumber: true,
              receivedDate: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.receiptScan.findMany({
        where: scanWhere,
        orderBy: { scanTimestamp: 'asc' },
      }),
    ]);

    // Group lines by receipt for the human-readable response.
    const receiptGroups = new Map<string, RecallReceiptGroup>();
    for (const line of matchingLines) {
      const existing = receiptGroups.get(line.receiptId);
      const lineEntry: RecallReceiptLine = {
        id: line.id,
        lineNumber: line.lineNumber,
        sku: line.sku,
        productId: line.productId,
        productName: line.productName,
        qtyExpected: line.qtyExpected,
        qtyReceived: line.qtyReceived,
        lotNumber: line.lotNumber,
        serialNumber: line.serialNumber,
        expirationDate: line.expirationDate?.toISOString() ?? null,
        manufactureDate: line.manufactureDate?.toISOString() ?? null,
      };
      if (existing) {
        existing.lines.push(lineEntry);
      } else {
        receiptGroups.set(line.receiptId, {
          receiptId: line.receipt.id,
          receiptNumber: line.receipt.receiptNumber,
          supplierId: line.receipt.supplierId,
          poNumber: line.receipt.poNumber,
          receivedDate: line.receipt.receivedDate?.toISOString() ?? null,
          status: line.receipt.status,
          lines: [lineEntry],
        });
      }
    }

    // Candidate downstream orders: any OrderLine for a productId that the
    // recall lot touched. Best-effort — see file header.
    const productIds = new Set<string>();
    for (const line of matchingLines) {
      if (line.productId) productIds.add(line.productId);
    }
    for (const scan of matchingScans) {
      if (scan.productId) productIds.add(scan.productId);
    }

    let orderRefs: RecallOrderRef[] = [];
    if (productIds.size > 0) {
      const orderLineWhere: Prisma.OrderLineWhereInput = {
        productId: { in: Array.from(productIds) },
      };
      const orderLines = await prisma.orderLine.findMany({
        where: orderLineWhere,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              retailerId: true,
              wholesalerId: true,
              orderDate: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      orderRefs = orderLines.map((ol) => ({
        orderId: ol.order.id,
        orderNumber: ol.order.orderNumber,
        retailerId: ol.order.retailerId,
        wholesalerId: ol.order.wholesalerId,
        orderDate: ol.order.orderDate.toISOString(),
        productId: ol.productId,
        productName: ol.productName,
        sku: ol.sku,
        quantityOrdered: ol.quantityOrdered,
      }));
    }

    const scans: RecallScanRecord[] = matchingScans.map((s) => ({
      id: s.id,
      receiptId: s.receiptId,
      productId: s.productId,
      barcode: s.barcode,
      scannedQty: s.scannedQty,
      lotNumber: s.lotNumber,
      serialNumber: s.serialNumber,
      expirationDate: s.expirationDate?.toISOString() ?? null,
      scanTimestamp: s.scanTimestamp.toISOString(),
    }));

    const response: RecallResponse = {
      lot,
      totals: {
        receiptCount: receiptGroups.size,
        lineCount: matchingLines.length,
        scanCount: matchingScans.length,
        orderCount: orderRefs.length,
      },
      receipts: Array.from(receiptGroups.values()),
      scans,
      orders: orderRefs,
    };

    logger.info({
      event: 'recall_lookup',
      lot,
      userId: user.id,
      receiptCount: response.totals.receiptCount,
      lineCount: response.totals.lineCount,
      scanCount: response.totals.scanCount,
      orderCount: response.totals.orderCount,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error({
      event: 'recall_lookup_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to perform recall lookup' },
      { status: 500 },
    );
  }
}
