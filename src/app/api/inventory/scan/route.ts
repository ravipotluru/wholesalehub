import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { barcodeScanSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';

/** POST /api/inventory/scan — Barcode scan during receiving */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as Record<string, unknown>;
    const body = await request.json();
    const validation = barcodeScanSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { receiptId, barcode, quantity, condition } = validation.data;

    // Verify receipt exists and is receivable
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

    // Also try UPC code on product directly
    let product = barcodeRecord?.product || null;
    if (!product) {
      product = await prisma.product.findFirst({
        where: { upcCode: barcode },
      });
    }

    // Record the scan
    await prisma.receiptScan.create({
      data: {
        receiptId,
        userId: user.id as string,
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

    // Find matching receipt line
    const receiptLine = await prisma.receiptLine.findFirst({
      where: {
        receiptId,
        OR: [
          { productId: product.id },
          { sku: product.sku },
          { upc: barcode },
        ],
      },
    });

    if (receiptLine) {
      // Update receipt line
      const newQtyReceived = receiptLine.qtyReceived + quantity;
      const damaged = condition === 'DAMAGED_MINOR' || condition === 'DAMAGED_MAJOR'
        ? receiptLine.qtyDamaged + quantity
        : receiptLine.qtyDamaged;

      let lineStatus: 'RECEIVED' | 'SHORT' | 'OVER' | 'DAMAGED' | 'PENDING' = 'PENDING';
      if (damaged > 0) lineStatus = 'DAMAGED';
      else if (newQtyReceived >= receiptLine.qtyExpected) lineStatus = 'RECEIVED';
      else if (newQtyReceived > 0) lineStatus = 'SHORT';
      if (newQtyReceived > receiptLine.qtyExpected) lineStatus = 'OVER';

      await prisma.receiptLine.update({
        where: { id: receiptLine.id },
        data: {
          qtyReceived: newQtyReceived,
          qtyDamaged: damaged,
          condition: condition as never,
          lineStatus: lineStatus as never,
        },
      });

      // Update receipt totals
      const allLines = await prisma.receiptLine.findMany({
        where: { receiptId },
      });
      const totalReceived = allLines.reduce((sum, l) => sum + l.qtyReceived, 0);
      const linesReceived = allLines.filter((l) => l.qtyReceived > 0).length;
      const discrepancies = allLines.filter(
        (l) => l.lineStatus === 'SHORT' || l.lineStatus === 'OVER' || l.lineStatus === 'DAMAGED'
      ).length;

      const allDone = allLines.every((l) => l.lineStatus !== 'PENDING');

      await prisma.inventoryReceipt.update({
        where: { id: receiptId },
        data: {
          totalQtyReceived: totalReceived,
          totalLinesReceived: linesReceived,
          discrepancyCount: discrepancies,
          status: allDone ? 'FULLY_RECEIVED' : 'PARTIAL_RECEIVED',
        },
      });

      // Auto-create discrepancy if needed
      if (lineStatus === 'SHORT' || lineStatus === 'OVER' || lineStatus === 'DAMAGED') {
        const existingDiscrep = await prisma.discrepancy.findFirst({
          where: { receiptId, sku: product.sku },
        });

        if (!existingDiscrep) {
          await prisma.discrepancy.create({
            data: {
              receiptId,
              type: lineStatus === 'DAMAGED' ? 'DAMAGED' : lineStatus === 'SHORT' ? 'SHORT' : 'OVER',
              productName: product.name,
              sku: product.sku,
              qtyExpected: receiptLine.qtyExpected,
              qtyReceived: newQtyReceived,
              qtyVariance: newQtyReceived - receiptLine.qtyExpected,
            },
          });
        }
      }

      logger.info({
        event: 'barcode_scan_matched',
        barcode,
        productId: product.id,
        receiptId,
        qtyReceived: newQtyReceived,
        lineStatus,
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
          qtyExpected: receiptLine.qtyExpected,
          qtyReceived: newQtyReceived,
          lineStatus,
          hasDiscrepancy: lineStatus !== 'RECEIVED' && lineStatus !== 'PENDING',
        },
      });
    }

    // Product found but no matching receipt line
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
  } catch (error) {
    logger.error({ event: 'barcode_scan_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to process scan' }, { status: 500 });
  }
}
