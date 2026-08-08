import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateReceiptNumber } from '@/lib/utils';
import { inventoryWebhookSchema } from '@/lib/validators';
import { hmacSha256Hex, timingSafeEqualHex } from '@/lib/hmac';

const DEMO_SECRET = 'whsec_demo_secret_key';

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
    // Refuse to run in production with the demo secret committed to the repo.
    if (process.env.NODE_ENV === 'production' && secret === DEMO_SECRET) {
      logger.error({ event: 'webhook_secret_is_demo_value' });
      return new NextResponse(null, { status: 500 });
    }

    const expectedSignature = hmacSha256Hex(secret, rawBody);

    if (!timingSafeEqualHex(signature, expectedSignature)) {
      logger.warn({
        event: 'webhook_hmac_failure',
        apiKey,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        reason: 'signature_mismatch',
      });

      // Audit failed webhook (best-effort; never block on audit failures)
      try {
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
      } catch (auditErr) {
        logger.error({
          event: 'webhook_audit_failure',
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      return new NextResponse(null, { status: 401 });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      logger.warn({ event: 'webhook_invalid_json', apiKey });
      return new NextResponse(null, { status: 400 });
    }

    const validated = inventoryWebhookSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.warn({
        event: 'webhook_invalid_payload',
        apiKey,
        errors: validated.error.flatten(),
      });
      return new NextResponse(null, { status: 400 });
    }
    const payload = validated.data;
    const referenceId = payload.po_number || payload.document_id!;

    // Idempotency check: reject duplicate supplier_id + document_id
    const existingReceipt = await prisma.inventoryReceipt.findFirst({
      where: {
        supplierId: payload.supplier_id,
        poNumber: referenceId,
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

    // Receipt creation + audit row in one transaction so we never have a
    // receipt without its corresponding audit event (or vice versa).
    const receipt = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryReceipt.create({
        data: {
          receiptNumber: generateReceiptNumber(),
          supplierId: payload.supplier_id,
          poNumber: referenceId,
          documentType: payload.document_type || 'ASN',
          sourceChannel: 'API_WEBHOOK',
          carrier: payload.carrier,
          trackingNumber: payload.tracking_number,
          shipDate: payload.ship_date ? new Date(payload.ship_date) : null,
          expectedDate: payload.expected_date ? new Date(payload.expected_date) : null,
          status: 'AWAITING_ARRIVAL',
          totalLinesExpected: payload.line_items.length,
          totalQtyExpected: payload.line_items.reduce(
            (sum, item) => sum + item.quantity, 0,
          ),
          rawDocumentUrl: null,
          lines: {
            create: payload.line_items.map((item, index) => ({
              lineNumber: index + 1,
              sku: item.sku,
              upc: item.upc,
              productName: item.product_name,
              qtyExpected: item.quantity,
              unitCost: item.unit_cost,
              lotNumber: item.lot_number,
              serialNumber: item.serial_number,
              expirationDate: item.expiration_date ? new Date(item.expiration_date) : null,
              manufactureDate: item.manufacture_date ? new Date(item.manufacture_date) : null,
            })),
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: `WEBHOOK:${apiKey}`,
          actorType: 'WEBHOOK',
          action: 'CREATE',
          entityType: 'RECEIPT',
          entityId: created.id,
          newState: {
            receiptNumber: created.receiptNumber,
            supplierId: payload.supplier_id,
            lineCount: payload.line_items.length,
          },
          changedFields: [],
          metadata: {
            webhookPayloadHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
          },
        },
      });

      return created;
    });

    logger.info({
      event: 'webhook_receipt_created',
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      supplierId: payload.supplier_id,
      lineCount: payload.line_items.length,
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
