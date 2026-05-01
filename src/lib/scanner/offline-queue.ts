/**
 * localStorage-backed offline scan queue. The warehouse-floor mobile app
 * needs to keep working when the dock loses WiFi: scans go into this queue,
 * and we drain to the server when the network returns.
 *
 * The queue stores pending scans as {id, receiptId, barcode, condition,
 * scannedAt}. Order is preserved (FIFO). Each scan that succeeds is removed;
 * a scan that fails 4xx is removed (irrecoverable); a scan that fails 5xx /
 * network is left in the queue for the next drain.
 */

const STORAGE_KEY = 'wholesalehub:scan-queue:v1';

export interface QueuedScan {
  id: string;
  receiptId: string;
  barcode: string;
  quantity: number;
  condition: 'GOOD' | 'DAMAGED';
  scannedAt: string;
}

function safeParse(raw: string | null): QueuedScan[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is QueuedScan =>
        x != null &&
        typeof x.id === 'string' &&
        typeof x.receiptId === 'string' &&
        typeof x.barcode === 'string' &&
        typeof x.quantity === 'number' &&
        (x.condition === 'GOOD' || x.condition === 'DAMAGED') &&
        typeof x.scannedAt === 'string',
    );
  } catch {
    return [];
  }
}

function read(): QueuedScan[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function write(queue: QueuedScan[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage full / disabled — caller should already be showing the
    // offline banner, just drop silently rather than throwing.
  }
}

export function enqueueScan(scan: Omit<QueuedScan, 'id' | 'scannedAt'>): QueuedScan {
  const next: QueuedScan = {
    ...scan,
    id:
      'q_' +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36),
    scannedAt: new Date().toISOString(),
  };
  const queue = read();
  queue.push(next);
  write(queue);
  return next;
}

export function listQueue(): QueuedScan[] {
  return read();
}

export function queueLength(): number {
  return read().length;
}

export function dropScan(id: string): void {
  write(read().filter((s) => s.id !== id));
}

export function clearQueue(): void {
  write([]);
}

/**
 * Try to send each queued scan to /api/inventory/scan. Removes successes +
 * 4xx (terminal). Leaves 5xx / network errors in the queue for next drain.
 *
 * Returns counts so the caller can update its banner ("3 of 7 synced").
 * Caller decides whether to drain — typically on `online` event or visibility
 * change.
 */
export async function drainQueue(opts: {
  onProgress?: (sent: number, remaining: number) => void;
} = {}): Promise<{ sent: number; failed: number; remaining: number }> {
  let sent = 0;
  let failed = 0;
  for (const scan of read()) {
    try {
      const res = await fetch('/api/inventory/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId: scan.receiptId,
          barcode: scan.barcode,
          quantity: scan.quantity,
          condition: scan.condition,
        }),
      });
      if (res.status >= 500) {
        failed++;
        break; // server-side issue; stop so we don't hammer
      }
      // 2xx success or 4xx terminal — drop either way (4xx isn't going to fix itself)
      dropScan(scan.id);
      sent++;
      opts.onProgress?.(sent, queueLength());
    } catch {
      // network error — leave queued, exit drain
      failed++;
      break;
    }
  }
  return { sent, failed, remaining: queueLength() };
}
