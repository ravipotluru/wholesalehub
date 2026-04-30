/**
 * Tests for POST /api/inventory/scan focused on lot/serial/expiration
 * write-through. Confirms:
 *   - lot fields are persisted on every ReceiptScan
 *   - first scan with a lot populates ReceiptLine.lotNumber when null
 *   - a scan does NOT overwrite an existing line lot
 */

const mockGetAuthedUser = jest.fn();
const mockInventoryReceiptFindUnique = jest.fn();
const mockInventoryReceiptUpdate = jest.fn();
const mockProductBarcodeFindUnique = jest.fn();
const mockProductFindFirst = jest.fn();
const mockReceiptLineFindFirst = jest.fn();
const mockReceiptLineUpdate = jest.fn();
const mockReceiptLineFindMany = jest.fn();
const mockReceiptScanCreate = jest.fn();
const mockDiscrepancyFindFirst = jest.fn();
const mockDiscrepancyCreate = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@/lib/session', () => ({
  getAuthedUser: mockGetAuthedUser,
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    inventoryReceipt: {
      findUnique: mockInventoryReceiptFindUnique,
      update: mockInventoryReceiptUpdate,
    },
    productBarcode: { findUnique: mockProductBarcodeFindUnique },
    product: { findFirst: mockProductFindFirst },
    receiptLine: {
      findFirst: mockReceiptLineFindFirst,
      update: mockReceiptLineUpdate,
      findMany: mockReceiptLineFindMany,
    },
    receiptScan: { create: mockReceiptScanCreate },
    discrepancy: {
      findFirst: mockDiscrepancyFindFirst,
      create: mockDiscrepancyCreate,
    },
    $transaction: mockTransaction,
  },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/inventory/scan/route';

function buildReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/inventory/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const adminUser = {
  id: 'user-1',
  role: 'WAREHOUSE_STAFF' as const,
  retailerId: null,
  wholesalerId: null,
};

const baseReceipt = {
  id: 'rcp-1',
  status: 'AWAITING_ARRIVAL',
};

const baseProduct = {
  id: 'prod-1',
  name: 'Disposable Vape',
  sku: 'SKU-1',
  brand: 'BrandX',
  upcCode: '012345678901',
};

/**
 * Run a full transaction: record what gets passed to receiptLine.update
 * and receiptScan.create so the assertions can inspect the patch.
 */
function wireTransaction(line: {
  id: string;
  qtyExpected: number;
  qtyReceived: number;
  qtyDamaged: number;
  lotNumber: string | null;
  serialNumber: string | null;
  expirationDate: Date | null;
}) {
  // First update returns the post-increment line; second update is the
  // lineStatus-only patch — we only inspect the first.
  let firstUpdateCall = true;
  mockReceiptLineUpdate.mockImplementation(async ({ data }) => {
    if (firstUpdateCall) {
      firstUpdateCall = false;
      return {
        ...line,
        qtyReceived: line.qtyReceived + (data.qtyReceived?.increment ?? 0),
      };
    }
    return { ...line, qtyReceived: line.qtyReceived + 1 };
  });
  mockReceiptLineFindMany.mockResolvedValue([
    {
      qtyReceived: line.qtyReceived + 1,
      lineStatus: 'PENDING',
    },
  ]);
  mockInventoryReceiptUpdate.mockResolvedValue({});
  mockDiscrepancyFindFirst.mockResolvedValue(null);

  mockTransaction.mockImplementation(async (fn) => {
    const tx = {
      receiptScan: { create: mockReceiptScanCreate },
      receiptLine: {
        update: mockReceiptLineUpdate,
        findMany: mockReceiptLineFindMany,
      },
      inventoryReceipt: { update: mockInventoryReceiptUpdate },
      discrepancy: {
        findFirst: mockDiscrepancyFindFirst,
        create: mockDiscrepancyCreate,
      },
    };
    return fn(tx);
  });
}

describe('POST /api/inventory/scan — lot/serial/expiration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthedUser.mockResolvedValue(adminUser);
    mockInventoryReceiptFindUnique.mockResolvedValue(baseReceipt);
    mockProductBarcodeFindUnique.mockResolvedValue({
      barcode: '012345678901',
      barcodeType: 'UPC',
      product: baseProduct,
    });
    mockProductFindFirst.mockResolvedValue(null);
  });

  it('persists lot/serial/expiration on the ReceiptScan row', async () => {
    const matchingLine = {
      id: 'rl-1',
      qtyExpected: 100,
      qtyReceived: 0,
      qtyDamaged: 0,
      lotNumber: null,
      serialNumber: null,
      expirationDate: null,
    };
    mockReceiptLineFindFirst.mockResolvedValueOnce(matchingLine);
    wireTransaction(matchingLine);

    const res = await POST(
      buildReq({
        receiptId: 'rcp-1',
        barcode: '012345678901',
        quantity: 1,
        lotNumber: 'LOT-99',
        serialNumber: 'SN-A',
        expirationDate: '2027-12-31T00:00:00.000Z',
      }),
    );
    expect(res.status).toBe(200);

    expect(mockReceiptScanCreate).toHaveBeenCalledTimes(1);
    const scanData = mockReceiptScanCreate.mock.calls[0][0].data;
    expect(scanData.lotNumber).toBe('LOT-99');
    expect(scanData.serialNumber).toBe('SN-A');
    expect(scanData.expirationDate).toEqual(new Date('2027-12-31T00:00:00.000Z'));
  });

  it('copies lot/serial/expiration onto the ReceiptLine when the line lot is null (first-scan-wins)', async () => {
    const matchingLine = {
      id: 'rl-1',
      qtyExpected: 100,
      qtyReceived: 0,
      qtyDamaged: 0,
      lotNumber: null,
      serialNumber: null,
      expirationDate: null,
    };
    mockReceiptLineFindFirst.mockResolvedValueOnce(matchingLine);
    wireTransaction(matchingLine);

    await POST(
      buildReq({
        receiptId: 'rcp-1',
        barcode: '012345678901',
        quantity: 1,
        lotNumber: 'LOT-99',
        serialNumber: 'SN-A',
        expirationDate: '2027-12-31T00:00:00.000Z',
      }),
    );

    // First call to receiptLine.update is the increment + lot patch.
    const firstCall = mockReceiptLineUpdate.mock.calls[0][0];
    expect(firstCall.where).toEqual({ id: 'rl-1' });
    expect(firstCall.data.lotNumber).toBe('LOT-99');
    expect(firstCall.data.serialNumber).toBe('SN-A');
    expect(firstCall.data.expirationDate).toEqual(
      new Date('2027-12-31T00:00:00.000Z'),
    );
  });

  it('does NOT overwrite an existing line lot on subsequent scans', async () => {
    const matchingLine = {
      id: 'rl-1',
      qtyExpected: 100,
      qtyReceived: 50,
      qtyDamaged: 0,
      lotNumber: 'LOT-ORIGINAL',
      serialNumber: null,
      expirationDate: null,
    };
    mockReceiptLineFindFirst.mockResolvedValueOnce(matchingLine);
    wireTransaction(matchingLine);

    await POST(
      buildReq({
        receiptId: 'rcp-1',
        barcode: '012345678901',
        quantity: 1,
        // Worker scans a different lot — this could happen on a multi-lot
        // delivery. The line lot stays put; the per-scan lot preserves
        // the divergence.
        lotNumber: 'LOT-DIFFERENT',
      }),
    );

    const firstCall = mockReceiptLineUpdate.mock.calls[0][0];
    expect(firstCall.data.lotNumber).toBeUndefined();

    // The scan itself still records the actually-scanned lot.
    const scanData = mockReceiptScanCreate.mock.calls[0][0].data;
    expect(scanData.lotNumber).toBe('LOT-DIFFERENT');
  });

  it('does not patch line metadata when no lot fields were provided in the scan', async () => {
    const matchingLine = {
      id: 'rl-1',
      qtyExpected: 100,
      qtyReceived: 0,
      qtyDamaged: 0,
      lotNumber: null,
      serialNumber: null,
      expirationDate: null,
    };
    mockReceiptLineFindFirst.mockResolvedValueOnce(matchingLine);
    wireTransaction(matchingLine);

    await POST(
      buildReq({
        receiptId: 'rcp-1',
        barcode: '012345678901',
        quantity: 1,
      }),
    );

    const firstCall = mockReceiptLineUpdate.mock.calls[0][0];
    expect(firstCall.data.lotNumber).toBeUndefined();
    expect(firstCall.data.serialNumber).toBeUndefined();
    expect(firstCall.data.expirationDate).toBeUndefined();

    // Scan still gets nulls — present in payload, just empty.
    const scanData = mockReceiptScanCreate.mock.calls[0][0].data;
    expect(scanData.lotNumber).toBeNull();
    expect(scanData.serialNumber).toBeNull();
    expect(scanData.expirationDate).toBeNull();
  });

  it('partially backfills the line — only fields the line is missing get populated', async () => {
    const matchingLine = {
      id: 'rl-1',
      qtyExpected: 100,
      qtyReceived: 0,
      qtyDamaged: 0,
      lotNumber: 'LOT-FROM-ASN',
      serialNumber: null,
      expirationDate: null,
    };
    mockReceiptLineFindFirst.mockResolvedValueOnce(matchingLine);
    wireTransaction(matchingLine);

    await POST(
      buildReq({
        receiptId: 'rcp-1',
        barcode: '012345678901',
        quantity: 1,
        lotNumber: 'LOT-WORKER-SAW',
        serialNumber: 'SN-NEW',
        expirationDate: '2027-12-31T00:00:00.000Z',
      }),
    );

    const firstCall = mockReceiptLineUpdate.mock.calls[0][0];
    // ASN-supplied lot is preserved.
    expect(firstCall.data.lotNumber).toBeUndefined();
    // Serial and expiration were null on the line, so they backfill.
    expect(firstCall.data.serialNumber).toBe('SN-NEW');
    expect(firstCall.data.expirationDate).toEqual(
      new Date('2027-12-31T00:00:00.000Z'),
    );
  });
});
