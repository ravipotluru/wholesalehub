/**
 * Tests for POST /api/webhooks/inventory focused on the lot/serial/expiration
 * pass-through. Confirms the webhook ingest forwards the new optional fields
 * onto every ReceiptLine.create payload.
 */

const mockInventoryReceiptFindFirst = jest.fn();
const mockTransaction = jest.fn();
const mockInventoryReceiptCreate = jest.fn();
const mockAuditEventCreate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    inventoryReceipt: {
      findFirst: mockInventoryReceiptFindFirst,
      create: mockInventoryReceiptCreate,
    },
    auditEvent: { create: mockAuditEventCreate },
    $transaction: mockTransaction,
  },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { hmacSha256Hex } from '@/lib/hmac';
import { POST } from '@/app/api/webhooks/inventory/route';

const TEST_SECRET = 'whsec_test_secret_key';

function signedReq(payload: Record<string, unknown>): NextRequest {
  const body = JSON.stringify(payload);
  const signature = hmacSha256Hex(TEST_SECRET, body);
  return new NextRequest('http://localhost/api/webhooks/inventory', {
    method: 'POST',
    headers: {
      'X-API-Key': 'key-test',
      'X-Signature': signature,
      'content-type': 'application/json',
    },
    body,
  });
}

describe('POST /api/webhooks/inventory — lot/serial/expiration pass-through', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WEBHOOK_SECRET = TEST_SECRET;
    // NODE_ENV is 'test' in jest by default — leave it alone (TS errors on
    // assignment in some configs and the route only short-circuits on
    // 'production' anyway).
    mockInventoryReceiptFindFirst.mockResolvedValue(null);
    mockInventoryReceiptCreate.mockResolvedValue({
      id: 'rcp-new',
      receiptNumber: 'RCP-NEW-1',
    });
    mockAuditEventCreate.mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        inventoryReceipt: { create: mockInventoryReceiptCreate },
        auditEvent: { create: mockAuditEventCreate },
      };
      return fn(tx);
    });
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('forwards lot_number / serial_number / expiration_date / manufacture_date onto ReceiptLine.create', async () => {
    const res = await POST(
      signedReq({
        supplier_id: 'SUP-1',
        po_number: 'PO-123',
        line_items: [
          {
            sku: 'SKU-1',
            product_name: 'Disposable Vape',
            quantity: 100,
            lot_number: 'LOT-2026-04',
            serial_number: 'SN-0001',
            expiration_date: '2027-12-31T00:00:00.000Z',
            manufacture_date: '2026-01-15T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(res.status).toBe(201);

    expect(mockInventoryReceiptCreate).toHaveBeenCalledTimes(1);
    const arg = mockInventoryReceiptCreate.mock.calls[0][0];
    expect(arg.data.lines.create).toHaveLength(1);
    const lineData = arg.data.lines.create[0];
    expect(lineData.sku).toBe('SKU-1');
    expect(lineData.lotNumber).toBe('LOT-2026-04');
    expect(lineData.serialNumber).toBe('SN-0001');
    expect(lineData.expirationDate).toEqual(
      new Date('2027-12-31T00:00:00.000Z'),
    );
    expect(lineData.manufactureDate).toEqual(
      new Date('2026-01-15T00:00:00.000Z'),
    );
  });

  it('passes undefined / null when ASN omits lot fields (existing suppliers unaffected)', async () => {
    const res = await POST(
      signedReq({
        supplier_id: 'SUP-1',
        po_number: 'PO-456',
        line_items: [
          { sku: 'SKU-2', product_name: 'Glass Pipe', quantity: 25 },
        ],
      }),
    );
    expect(res.status).toBe(201);

    const arg = mockInventoryReceiptCreate.mock.calls[0][0];
    const lineData = arg.data.lines.create[0];
    expect(lineData.lotNumber).toBeUndefined();
    expect(lineData.serialNumber).toBeUndefined();
    expect(lineData.expirationDate).toBeNull();
    expect(lineData.manufactureDate).toBeNull();
  });

  it('rejects a malformed expiration_date with 400 (does not write)', async () => {
    const res = await POST(
      signedReq({
        supplier_id: 'SUP-1',
        po_number: 'PO-789',
        line_items: [
          {
            sku: 'SKU-3',
            product_name: 'Cartridge',
            quantity: 50,
            expiration_date: 'tomorrow',
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(mockInventoryReceiptCreate).not.toHaveBeenCalled();
  });
});
