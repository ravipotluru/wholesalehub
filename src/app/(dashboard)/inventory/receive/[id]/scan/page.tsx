import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { ScannerScreen } from './ScannerScreen';

interface PageProps {
  params: { id: string };
}

/**
 * /inventory/receive/[id]/scan — mobile-first scanner UI for warehouse staff.
 * Server Component fetches the receipt header + line summary; the Client
 * Component owns the camera/permission/queue state.
 */
export default async function InventoryScanPage({ params }: PageProps) {
  const user = await getAuthedUser();
  if (!user) redirect('/login');
  if (user.role !== 'WAREHOUSE_STAFF' && user.role !== 'ADMIN') {
    redirect('/inventory');
  }

  const receipt = await prisma.inventoryReceipt.findUnique({
    where: { id: params.id },
    include: {
      lines: {
        select: {
          id: true,
          productId: true,
          qtyExpected: true,
          qtyReceived: true,
          lineStatus: true,
          product: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  });

  if (!receipt) notFound();

  const totals = {
    expected: receipt.lines.reduce((sum, l) => sum + l.qtyExpected, 0),
    received: receipt.lines.reduce((sum, l) => sum + l.qtyReceived, 0),
  };

  return (
    <ScannerScreen
      receiptId={receipt.id}
      poNumber={receipt.poNumber ?? receipt.id}
      status={receipt.status}
      totals={totals}
      lines={receipt.lines.map((l) => ({
        id: l.id,
        productName: l.product.name,
        sku: l.product.sku,
        qtyExpected: l.qtyExpected,
        qtyReceived: l.qtyReceived,
        lineStatus: l.lineStatus,
      }))}
    />
  );
}
