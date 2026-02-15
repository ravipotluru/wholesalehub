import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateReceiptNumber } from '@/lib/utils';

/** POST /api/webhooks/inventory/receive — Supplier ASN webhook with HMAC-SHA256 verification */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key');
    const signature = request.headers.get('X-Signature');

    if (!apiKey || !signature) {
      logger.warn({ event: 'webhook_missing_headers', hasApiKey: !!apiKey, hasSignature: !!signature });
      return new NextResponse(null, { status: 401 });
    }

    // Read raw body for HMAC verification
    const rawBody = await request.text();

    // Verify HMAC-SHA256 signature
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      logger.error({ event: 'webhook_secret_missing' });
      return new NextResponse(null, { status: 500 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn({
        event: 'webhook_hmac_failure',
        apiKey,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        reason: 'signature_mismatch',
      });

      // Audit failed webhook
      await prisma.auditEvent.create({
        data: {
          actorId: `WEBHOOK:${apiKey}`,
          actorType: 'WEBHOOK',
          action: 'WEBHOOK_HMAC_FAILURE',
          entityType: 'WEBHOOK',
          entityId: apiKey,
          metadata: {
            ip: request.headers.get('x-forwarded-for'),
            reason: 'signature_mismatch',
          },
          changedFields: [],
        },
      });

      return new NextResponse(null, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // Idempotency check: reject duplicate supplier_id + document_id
    const existingReceipt = await prisma.inventoryReceipt.findFirst({
      where: {
        supplierId: payload.supplier_id,
        poNumber: payload.document_id || payload.po_number,
      },
    });

    if (existingReceipt) {
      logger.info({
        event: 'webhook_duplicate',
        supplierId: payload.supplier_id,
        documentId: payload.document_id,
        existingReceiptId: existingReceipt.id,
      });
      return NextResponse.json(
        { message: 'Duplicate webhook — receipt already exists', receiptId: existingReceipt.id },
        { status: 200 }
      );
    }

    // Create receipt from webhook payload
    const receipt = await prisma.inventoryReceipt.create({
      data: {
        receiptNumber: generateReceiptNumber(),
        supplierId: payload.supplier_id,
        poNumber: payload.po_number || payload.document_id,
        documentType: payload.document_type || 'ASN',
        sourceChannel: 'API_WEBHOOK',
        carrier: payload.carrier,
        trackingNumber: payload.tracking_number,
        shipDate: payload.ship_date ? new Date(payload.ship_date) : null,
        expectedDate: payload.expected_date ? new Date(payload.expected_date) : null,
        status: 'AWAITING_ARRIVAL',
        totalLinesExpected: payload.line_items?.length || 0,
        totalQtyExpected: payload.line_items?.reduce(
          (sum: number, item: { quantity: number }) => sum + (item.quantity || 0), 0
        ) || 0,
        rawDocumentUrl: null,
        lines: {
          create: (payload.line_items || []).map(
            (item: { sku: string; upc?: string; product_name: string; quantity: number; unit_cost?: number }, index: number) => ({
              lineNumber: index + 1,
              sku: item.sku,
              upc: item.upc,
              productName: item.product_name,
              qtyExpected: item.quantity,
              unitCost: item.unit_cost,
            })
          ),
        },
      },
    });

    // Audit successful webhook
    await prisma.auditEvent.create({
      data: {
        actorId: `WEBHOOK:${apiKey}`,
        actorType: 'WEBHOOK',
        action: 'CREATE',
        entityType: 'RECEIPT',
        entityId: receipt.id,
        newState: {
          receiptNumber: receipt.receiptNumber,
          supplierId: payload.supplier_id,
          lineCount: payload.line_items?.length || 0,
        },
        changedFields: [],
        metadata: {
          webhookPayloadHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
        },
      },
    });

    logger.info({
      event: 'webhook_receipt_created',
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      supplierId: payload.supplier_id,
      lineCount: payload.line_items?.length || 0,
    });

    return NextResponse.json(
      {
        message: 'Receipt created',
        receiptId: receipt.id,
        receiptNumber: receipt.receiptNumber,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ event: 'webhook_error', error: (error as Error).message });
    return new NextResponse(null, { status: 500 });
  }
}
