import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { barcodeScanSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';

/** POST /api/inventory/scan — Barcode scan during receiving */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = barcodeScanSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { receiptId, barcode, quantity, condition } = validation.data;

    // Verify receipt exists and is receivable (cheap read outside the txn)
    const receipt = await prisma.inventoryReceipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    if (!['AWAITING_ARRIVAL', 'PARTIAL_RECEIVED'].includes(receipt.status)) {
      return NextResponse.json(
        { error: `Receipt cannot be scanned in status: ${receipt.status}` },
        { status: 400 }
      );
    }

    // Look up product by barcode
    const barcodeRecord = await prisma.productBarcode.findUnique({
      where: { barcode },
      include: { product: true },
    });

    let product = barcodeRecord?.product || null;
    if (!product) {
      product = await prisma.product.findFirst({ where: { upcCode: barcode } });
    }

    // Always record the scan, regardless of match.
    await prisma.receiptScan.create({
      data: {
        receiptId,
        userId: user.id,
        barcode,
        barcodeType: barcodeRecord?.barcodeType || 'UPC',
        productId: product?.id || null,
        scannedQty: quantity,
        condition,
      },
    });

    if (!product) {
      logger.warn({ event: 'barcode_not_found', barcode, receiptId });
      return NextResponse.json({
        matched: false,
        barcode,
        message: 'Barcode not found in product catalog. You can add it manually.',
      });
    }

    // Find matching receipt line (capturing for closure use below)
    const matchingLine = await prisma.receiptLine.findFirst({
      where: {
        receiptId,
        OR: [
          { productId: product.id },
          { sku: product.sku },
          { upc: barcode },
        ],
      },
    });

    if (!matchingLine) {
      return NextResponse.json({
        matched: true,
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          brand: product.brand,
        },
        receiptLine: null,
        message: 'Product found but not expected on this receipt',
      });
    }

    // Atomic update + recompute totals + maybe-create discrepancy.
    // Doing this in a transaction means two concurrent scans on the same
    // receipt will not lose updates or compute stale totals.
    const txResult = await prisma.$transaction(async (tx) => {
      const damagedDelta =
        condition === 'DAMAGED_MINOR' || condition === 'DAMAGED_MAJOR' ? quantity : 0;

      // Atomic increment so concurrent scans don't lose updates.
      const updatedLine = await tx.receiptLine.update({
        where: { id: matchingLine.id },
        data: {
          qtyReceived: { increment: quantity },
          qtyDamaged: damagedDelta > 0 ? { increment: damagedDelta } : undefined,
          condition: condition as never,
        },
      });

      // Recompute lineStatus from the post-increment state.
      let lineStatus: 'RECEIVED' | 'SHORT' | 'OVER' | 'DAMAGED' | 'PENDING' = 'PENDING';
      if (updatedLine.qtyDamaged > 0) lineStatus = 'DAMAGED';
      else if (updatedLine.qtyReceived >= updatedLine.qtyExpected) lineStatus = 'RECEIVED';
      else if (updatedLine.qtyReceived > 0) lineStatus = 'SHORT';
      if (updatedLine.qtyReceived > updatedLine.qtyExpected) lineStatus = 'OVER';

      await tx.receiptLine.update({
        where: { id: matchingLine.id },
        data: { lineStatus: lineStatus as never },
      });

      // Recompute receipt totals from current line state.
      const allLines = await tx.receiptLine.findMany({
        where: { receiptId },
        select: { qtyReceived: true, lineStatus: true },
      });
      const totalReceived = allLines.reduce((sum, l) => sum + l.qtyReceived, 0);
      const linesReceived = allLines.filter((l) => l.qtyReceived > 0).length;
      const discrepancies = allLines.filter(
        (l) => l.lineStatus === 'SHORT' || l.lineStatus === 'OVER' || l.lineStatus === 'DAMAGED',
      ).length;
      const allDone = allLines.every((l) => l.lineStatus !== 'PENDING');

      await tx.inventoryReceipt.update({
        where: { id: receiptId },
        data: {
          totalQtyReceived: totalReceived,
          totalLinesReceived: linesReceived,
          discrepancyCount: discrepancies,
          status: allDone ? 'FULLY_RECEIVED' : 'PARTIAL_RECEIVED',
        },
      });

      // Auto-create a discrepancy row if needed (idempotent).
      if (lineStatus === 'SHORT' || lineStatus === 'OVER' || lineStatus === 'DAMAGED') {
        const existing = await tx.discrepancy.findFirst({
          where: { receiptId, sku: product!.sku },
        });
        if (!existing) {
          await tx.discrepancy.create({
            data: {
              receiptId,
              type: lineStatus === 'DAMAGED' ? 'DAMAGED' : lineStatus === 'SHORT' ? 'SHORT' : 'OVER',
              productName: product!.name,
              sku: product!.sku,
              qtyExpected: updatedLine.qtyExpected,
              qtyReceived: updatedLine.qtyReceived,
              qtyVariance: updatedLine.qtyReceived - updatedLine.qtyExpected,
            },
          });
        }
      }

      return { qtyReceived: updatedLine.qtyReceived, qtyExpected: updatedLine.qtyExpected, lineStatus };
    });

    logger.info({
      event: 'barcode_scan_matched',
      barcode,
      productId: product.id,
      receiptId,
      qtyReceived: txResult.qtyReceived,
      lineStatus: txResult.lineStatus,
    });

    return NextResponse.json({
      matched: true,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        brand: product.brand,
      },
      receiptLine: {
        // id is needed by the scanner UI's optimistic line-list update.
        id: matchingLine.id,
        qtyExpected: txResult.qtyExpected,
        qtyReceived: txResult.qtyReceived,
        lineStatus: txResult.lineStatus,
        hasDiscrepancy:
          txResult.lineStatus !== 'RECEIVED' && txResult.lineStatus !== 'PENDING',
      },
    });
  } catch (error) {
    logger.error({ event: 'barcode_scan_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to process scan' }, { status: 500 });
  }
}
