/**
 * Tests for GET /api/admin/recall
 *
 * Covers auth (401/403), the empty-result and populated-result paths, and
 * confirms that ReceiptScan rows surface in the response (so a multi-lot
 * delivery whose line lot was never written is still recall-discoverable).
 */

const mockGetAuthedUser = jest.fn();
const mockReceiptLineFindMany = jest.fn();
const mockReceiptScanFindMany = jest.fn();
const mockOrderLineFindMany = jest.fn();

jest.mock('@/lib/session', () => ({
  getAuthedUser: mockGetAuthedUser,
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    receiptLine: { findMany: mockReceiptLineFindMany },
    receiptScan: { findMany: mockReceiptScanFindMany },
    orderLine: { findMany: mockOrderLineFindMany },
  },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/recall/route';

function buildReq(url: string): NextRequest {
  return new NextRequest(url);
}

describe('GET /api/admin/recall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReceiptLineFindMany.mockResolvedValue([]);
    mockReceiptScanFindMany.mockResolvedValue([]);
    mockOrderLineFindMany.mockResolvedValue([]);
  });

  it('returns 401 when there is no session', async () => {
    mockGetAuthedUser.mockResolvedValueOnce(null);
    const res = await GET(buildReq('http://localhost/api/admin/recall?lot=LOT-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockGetAuthedUser.mockResolvedValueOnce({
      id: 'u1',
      role: 'RETAILER',
      retailerId: 'rt-1',
      wholesalerId: null,
    });
    const res = await GET(buildReq('http://localhost/api/admin/recall?lot=LOT-1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when lot query param is missing', async () => {
    mockGetAuthedUser.mockResolvedValueOnce({
      id: 'admin-1',
      role: 'ADMIN',
      retailerId: null,
      wholesalerId: null,
    });
    const res = await GET(buildReq('http://localhost/api/admin/recall'));
    expect(res.status).toBe(400);
  });

  it('returns 200 with an empty result for an unknown lot', async () => {
    mockGetAuthedUser.mockResolvedValueOnce({
      id: 'admin-1',
      role: 'ADMIN',
      retailerId: null,
      wholesalerId: null,
    });

    const res = await GET(
      buildReq('http://localhost/api/admin/recall?lot=NOT-A-LOT'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.lot).toBe('NOT-A-LOT');
    expect(body.totals).toEqual({
      receiptCount: 0,
      lineCount: 0,
      scanCount: 0,
      orderCount: 0,
    });
    expect(body.receipts).toEqual([]);
    expect(body.scans).toEqual([]);
    expect(body.orders).toEqual([]);

    // No order lookup is needed when there are no productIds.
    expect(mockOrderLineFindMany).not.toHaveBeenCalled();
  });

  it('groups matching lines by receipt and surfaces downstream orders', async () => {
    mockGetAuthedUser.mockResolvedValueOnce({
      id: 'admin-1',
      role: 'ADMIN',
      retailerId: null,
      wholesalerId: null,
    });

    const expDate = new Date('2027-12-31T00:00:00.000Z');
    const mfgDate = new Date('2026-01-15T00:00:00.000Z');
    const orderedAt = new Date('2026-04-15T12:00:00.000Z');
    const scanAt = new Date('2026-04-20T09:00:00.000Z');

    mockReceiptLineFindMany.mockResolvedValueOnce([
      {
        id: 'rl-a',
        lineNumber: 1,
        sku: 'SKU-1',
        productId: 'prod-1',
        productName: 'Disposable Vape',
        qtyExpected: 100,
        qtyReceived: 100,
        lotNumber: 'LOT-99',
        serialNumber: null,
        expirationDate: expDate,
        manufactureDate: mfgDate,
        receiptId: 'rcp-1',
        receipt: {
          id: 'rcp-1',
          receiptNumber: 'RCP-2026-0001',
          supplierId: 'SUP-1',
          poNumber: 'PO-1',
          receivedDate: orderedAt,
          status: 'FULLY_RECEIVED',
        },
      },
      {
        id: 'rl-b',
        lineNumber: 2,
        sku: 'SKU-1',
        productId: 'prod-1',
        productName: 'Disposable Vape',
        qtyExpected: 50,
        qtyReceived: 50,
        lotNumber: 'LOT-99',
        serialNumber: null,
        expirationDate: expDate,
        manufactureDate: mfgDate,
        receiptId: 'rcp-2',
        receipt: {
          id: 'rcp-2',
          receiptNumber: 'RCP-2026-0002',
          supplierId: 'SUP-2',
          poNumber: 'PO-2',
          receivedDate: orderedAt,
          status: 'FULLY_RECEIVED',
        },
      },
    ]);

    mockReceiptScanFindMany.mockResolvedValueOnce([
      {
        id: 'scan-1',
        receiptId: 'rcp-1',
        productId: 'prod-1',
        barcode: '012345678901',
        scannedQty: 1,
        lotNumber: 'LOT-99',
        serialNumber: null,
        expirationDate: expDate,
        scanTimestamp: scanAt,
      },
    ]);

    mockOrderLineFindMany.mockResolvedValueOnce([
      {
        productId: 'prod-1',
        productName: 'Disposable Vape',
        sku: 'SKU-1',
        quantityOrdered: 5,
        order: {
          id: 'ord-1',
          orderNumber: 'WH-2026-0001',
          retailerId: 'rt-1',
          wholesalerId: 'ws-1',
          orderDate: orderedAt,
        },
      },
    ]);

    const res = await GET(
      buildReq('http://localhost/api/admin/recall?lot=LOT-99'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.lot).toBe('LOT-99');
    expect(body.totals).toEqual({
      receiptCount: 2,
      lineCount: 2,
      scanCount: 1,
      orderCount: 1,
    });

    // Two receipts surface (rcp-1 and rcp-2), each with one matching line.
    expect(body.receipts).toHaveLength(2);
    expect(body.receipts[0].receiptNumber).toBe('RCP-2026-0001');
    expect(body.receipts[0].lines[0].lotNumber).toBe('LOT-99');
    expect(body.receipts[0].lines[0].expirationDate).toBe(
      '2027-12-31T00:00:00.000Z',
    );

    expect(body.scans).toHaveLength(1);
    expect(body.scans[0].lotNumber).toBe('LOT-99');

    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toMatchObject({
      orderId: 'ord-1',
      orderNumber: 'WH-2026-0001',
      productId: 'prod-1',
      sku: 'SKU-1',
    });
  });

  it('still surfaces scans even when no receipt line matched', async () => {
    // Lot recorded only on a scan (multi-lot delivery against a single
    // SKU line where the line lot was already populated by a different
    // lot from an earlier scan).
    mockGetAuthedUser.mockResolvedValueOnce({
      id: 'admin-1',
      role: 'ADMIN',
      retailerId: null,
      wholesalerId: null,
    });
    mockReceiptLineFindMany.mockResolvedValueOnce([]);
    mockReceiptScanFindMany.mockResolvedValueOnce([
      {
        id: 'scan-orphan',
        receiptId: 'rcp-1',
        productId: 'prod-1',
        barcode: '012345678901',
        scannedQty: 1,
        lotNumber: 'LOT-Y',
        serialNumber: null,
        expirationDate: null,
        scanTimestamp: new Date('2026-04-22T09:00:00.000Z'),
      },
    ]);
    mockOrderLineFindMany.mockResolvedValueOnce([]);

    const res = await GET(
      buildReq('http://localhost/api/admin/recall?lot=LOT-Y'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.totals.lineCount).toBe(0);
    expect(body.totals.scanCount).toBe(1);
    expect(body.scans[0].lotNumber).toBe('LOT-Y');
    // Scan still references productId, so the order lookup runs.
    expect(mockOrderLineFindMany).toHaveBeenCalled();
  });
});
