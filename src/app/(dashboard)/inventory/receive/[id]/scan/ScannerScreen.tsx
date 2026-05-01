'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Zap,
  CheckCircle2,
  WifiOff,
  AlertTriangle,
  X,
  Plus,
  Minus,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  enqueueScan,
  drainQueue,
  queueLength,
  type QueuedScan,
} from '@/lib/scanner/offline-queue';
import { cn } from '@/lib/utils';

/**
 * NOTE: This component currently uses a debounced text-input fake-scan
 * pattern instead of a real camera + barcode decode. To wire the real
 * scanner, swap `<input>` for `@zxing/browser` against
 * `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`.
 * The decode callback should call `onScan(decodedBarcode)` exactly the same
 * way the input's onChange does today. See docs/PRODUCTION-PLAN.md
 * "Mobile / PWA" section.
 */

interface ScreenProps {
  receiptId: string;
  poNumber: string;
  status: string;
  totals: { expected: number; received: number };
  lines: ReadonlyArray<{
    id: string;
    productName: string;
    sku: string;
    qtyExpected: number;
    qtyReceived: number;
    lineStatus: string;
  }>;
}

type PermissionState = 'pending' | 'granted' | 'denied';

interface LastScan {
  barcode: string;
  productName: string;
  qtyAfter: number;
  qtyExpected: number;
  variance: number;
}

export function ScannerScreen({ receiptId, poNumber, status, totals, lines }: ScreenProps) {
  const [permission, setPermission] = useState<PermissionState>('pending');
  const [online, setOnline] = useState<boolean>(true);
  const [queueLen, setQueueLen] = useState(0);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [discrepancyOpen, setDiscrepancyOpen] = useState<LastScan | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [linesState, setLinesState] = useState(lines);

  // Sync online status + drain queue on reconnect
  useEffect(() => {
    if (typeof navigator !== 'undefined') setOnline(navigator.onLine);
    setQueueLen(queueLength());

    const onOnline = async () => {
      setOnline(true);
      const result = await drainQueue();
      setQueueLen(result.remaining);
    };
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const overallProgress =
    totals.expected > 0 ? Math.round((totals.received / totals.expected) * 100) : 0;

  const requestCamera = async () => {
    try {
      // Touch getUserMedia just to trigger the browser permission prompt;
      // we don't actually use the stream until ZXing is wired in.
      await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setPermission('granted');
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      setPermission('denied');
    }
  };

  const handleScanInput = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim().length >= 6) {
        void onScan(value.trim());
        if (inputRef.current) inputRef.current.value = '';
      }
    }, 250);
  };

  const onScan = async (barcode: string) => {
    setError(null);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);

    if (!online) {
      enqueueScan({ receiptId, barcode, quantity: 1, condition: 'GOOD' });
      setQueueLen(queueLength());
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/inventory/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId, barcode, quantity: 1, condition: 'GOOD' }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        const message =
          (body.error as { message?: string } | undefined)?.message ??
          (typeof body.error === 'string' ? body.error : null) ??
          'Scan failed.';
        setError(message);
        return;
      }

      // Optimistic line update from response
      const line = body.line as
        | {
            id: string;
            qtyReceived: number;
            qtyExpected: number;
            lineStatus: string;
            product?: { name?: string };
          }
        | undefined;

      if (line) {
        setLinesState((current) =>
          current.map((l) =>
            l.id === line.id
              ? {
                  ...l,
                  qtyReceived: line.qtyReceived,
                  lineStatus: line.lineStatus,
                }
              : l,
          ),
        );
        const variance = line.qtyReceived - line.qtyExpected;
        const last: LastScan = {
          barcode,
          productName: line.product?.name ?? 'Unknown product',
          qtyAfter: line.qtyReceived,
          qtyExpected: line.qtyExpected,
          variance,
        };
        setLastScan(last);
        if (variance !== 0 || line.lineStatus === 'DAMAGED') {
          setDiscrepancyOpen(last);
        }
      } else {
        setLastScan({
          barcode,
          productName: 'Not on this receipt',
          qtyAfter: 0,
          qtyExpected: 0,
          variance: 0,
        });
      }
    } catch (e) {
      // Network failed — queue offline
      enqueueScan({ receiptId, barcode, quantity: 1, condition: 'GOOD' });
      setQueueLen(queueLength());
      setError(`Saved offline (${(e as Error).message}).`);
    } finally {
      setSubmitting(false);
    }
  };

  if (permission === 'pending') {
    return <PermissionGate onAllow={requestCamera} />;
  }
  if (permission === 'denied') {
    return <CameraError onRetry={requestCamera} />;
  }

  return (
    <div className="fixed inset-0 bg-dark text-white flex flex-col safe-area-inset">
      {/* Top progress chip */}
      <header className="px-4 pt-4 pb-2 flex items-center justify-between bg-dark/95 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white/10 px-3 py-1.5 inline-flex items-center gap-2 text-xs">
            <span className="font-mono">{poNumber}</span>
            <span className="text-white/60">·</span>
            <span className="font-semibold">{overallProgress}%</span>
          </div>
          {!online && (
            <div className="rounded-full bg-status-warning/20 border border-status-warning/40 px-2.5 py-1 inline-flex items-center gap-1.5 text-xs">
              <WifiOff className="h-3 w-3" />
              {queueLen} queued
            </div>
          )}
        </div>
        <button
          type="button"
          className="rounded-full bg-white/10 hover:bg-white/20 p-2"
          aria-label="Toggle torch (TODO: wire camera track constraints)"
        >
          <Zap className="h-4 w-4" />
        </button>
      </header>

      {/* Camera viewfinder placeholder */}
      <div className="flex-1 relative flex items-center justify-center p-4">
        <div className="relative w-full max-w-sm aspect-[3/4] bg-black/50 border border-white/10 rounded-2xl overflow-hidden">
          {/* Reticle */}
          <div className="absolute inset-8 border-2 border-success rounded-xl pointer-events-none">
            <span className="absolute -top-px -left-px w-6 h-6 border-t-4 border-l-4 border-success rounded-tl-xl" />
            <span className="absolute -top-px -right-px w-6 h-6 border-t-4 border-r-4 border-success rounded-tr-xl" />
            <span className="absolute -bottom-px -left-px w-6 h-6 border-b-4 border-l-4 border-success rounded-bl-xl" />
            <span className="absolute -bottom-px -right-px w-6 h-6 border-b-4 border-r-4 border-success rounded-br-xl" />
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-success/80 animate-pulse" />
          </div>
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/60">
            Aim at a barcode
          </p>
        </div>

        {/* Last-scan toast */}
        {lastScan && (
          <div
            role="status"
            aria-live="polite"
            className="absolute bottom-32 left-4 right-4 max-w-sm mx-auto bg-white/95 backdrop-blur text-dark rounded-xl px-4 py-3 shadow-lg flex items-center gap-3"
          >
            <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{lastScan.productName}</p>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                {lastScan.barcode} · {lastScan.qtyAfter}/{lastScan.qtyExpected}
              </p>
            </div>
            {lastScan.variance !== 0 && (
              <span className="text-xs font-semibold text-status-warning">
                {lastScan.variance > 0 ? `+${lastScan.variance}` : lastScan.variance}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Hidden text input that fakes scanner input. Replace with ZXing camera
          decode in a follow-up — see file header note. */}
      <input
        ref={inputRef}
        type="text"
        autoFocus
        autoComplete="off"
        inputMode="text"
        onChange={(e) => handleScanInput(e.target.value)}
        onBlur={(e) => e.currentTarget.focus()}
        placeholder="Scanner input (or type for manual)"
        className="fixed bottom-24 left-4 right-4 mx-auto max-w-sm bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-success"
        aria-label="Manual barcode entry"
      />

      {/* Bottom dock */}
      <footer className="bg-dark/95 backdrop-blur border-t border-white/10 px-4 py-3 flex items-center justify-around safe-area-bottom">
        <DockButton label="Lines" value={`${linesState.length}`} active />
        <DockButton label="Done" value={`${linesState.filter((l) => l.lineStatus === 'RECEIVED').length}`} />
        <DockButton label="Issues" value={`${linesState.filter((l) => l.lineStatus !== 'PENDING' && l.lineStatus !== 'RECEIVED').length}`} />
      </footer>

      {/* Discrepancy bottom sheet */}
      {discrepancyOpen && (
        <DiscrepancySheet
          last={discrepancyOpen}
          onClose={() => setDiscrepancyOpen(null)}
          submitting={submitting}
          onSubmit={async (qty, reason) => {
            // Real impl would PATCH to /api/inventory/scan or a dedicated
            // discrepancy route. For now, log + close.
            // eslint-disable-next-line no-console
            console.info('[scanner] discrepancy submitted', { qty, reason });
            setDiscrepancyOpen(null);
          }}
        />
      )}

      {error && (
        <div className="fixed top-20 left-4 right-4 max-w-sm mx-auto bg-status-error/95 text-white rounded-xl px-4 py-3 shadow-lg flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {status === 'FULLY_RECEIVED' && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
          <div className="bg-white text-dark rounded-2xl p-6 max-w-sm">
            <CheckCircle2 className="h-10 w-10 text-success mb-3" />
            <h2 className="text-lg font-bold">Receipt complete</h2>
            <p className="text-sm text-gray-500 mt-1">
              All lines received. Hand off to inventory review.
            </p>
            <Button
              variant="secondary"
              size="md"
              className="mt-4 w-full"
              onClick={() => (window.location.href = `/inventory/receive/${receiptId}`)}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PermissionGate({ onAllow }: { onAllow: () => void }) {
  return (
    <div className="min-h-[100dvh] bg-light flex items-center justify-center p-6">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 max-w-md w-full">
        <div className="w-12 h-12 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center mb-4">
          <Camera className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-dark">Allow camera to scan barcodes</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          We use your camera to read UPCs as boxes come off the truck. Nothing
          is recorded — frames stay on this device.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-dark">
          <BulletPoint>Faster than typing each SKU</BulletPoint>
          <BulletPoint>Auto-flags discrepancies inline</BulletPoint>
          <BulletPoint>Works offline — drains when you reconnect</BulletPoint>
        </ul>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="secondary" size="md" onClick={onAllow} className="w-full">
            Allow camera
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="w-full"
            onClick={() => alert('TODO: wire keypad/USB fallback path')}
          >
            Use keypad / USB scanner instead
          </Button>
        </div>
      </div>
    </div>
  );
}

function CameraError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-[100dvh] bg-dark text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="rounded-xl bg-success/15 border border-success/30 px-4 py-3 mb-4 text-sm">
          <p className="font-semibold">Progress saved</p>
          <p className="text-white/70 text-xs mt-0.5">
            Your scans before this error were already synced.
          </p>
        </div>
        <h1 className="text-xl font-bold">Camera unavailable</h1>
        <p className="text-sm text-white/70 mt-2 font-mono">NotAllowedError</p>
        <ol className="mt-6 space-y-3 text-sm">
          <RecoveryStep n={1}>Tap below to re-request access.</RecoveryStep>
          <RecoveryStep n={2}>If denied, open Settings → Site permissions → Camera.</RecoveryStep>
          <RecoveryStep n={3}>Or use the manual keypad fallback.</RecoveryStep>
        </ol>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="secondary" size="md" onClick={onRetry} className="w-full">
            Try camera again
          </Button>
          <Button variant="ghost" size="md" className="w-full text-white">
            Use keypad
          </Button>
        </div>
      </div>
    </div>
  );
}

function DiscrepancySheet({
  last,
  onClose,
  onSubmit,
  submitting,
}: {
  last: LastScan;
  onClose: () => void;
  onSubmit: (qty: number, reason: string) => Promise<void>;
  submitting: boolean;
}) {
  const [qty, setQty] = useState(last.qtyAfter);
  const [reason, setReason] = useState<string | null>(null);
  const REASONS = ['Short shipment', 'Over shipment', 'Damaged', 'Wrong product'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resolve discrepancy"
      className="fixed inset-0 z-40 bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white text-dark rounded-t-2xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Discrepancy detected</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -m-2 text-gray-500 hover:text-dark"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1 truncate">{last.productName}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Counted" value={last.qtyAfter} />
          <Stat label="Expected" value={last.qtyExpected} />
          <Stat
            label="Variance"
            value={last.variance > 0 ? `+${last.variance}` : `${last.variance}`}
            tone={last.variance < 0 ? 'error' : 'warning'}
          />
        </div>

        <div className="mt-5">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Adjust counted
          </label>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(0, q - 1))}
              className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 inline-flex items-center justify-center"
              aria-label="Decrease"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="text-3xl font-bold tabular-nums flex-1 text-center">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 inline-flex items-center justify-center"
              aria-label="Increase"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Reason
          </p>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  'text-sm rounded-lg border px-3 py-2 text-left',
                  reason === r
                    ? 'border-brand-blue bg-brand-blue/10 text-brand-blue font-semibold'
                    : 'border-gray-200 hover:border-gray-300 text-dark',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="md"
          className="w-full mt-5"
          disabled={!reason || submitting}
          onClick={() => reason && onSubmit(qty, reason)}
          leftIcon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          {submitting ? 'Saving…' : 'Save discrepancy'}
        </Button>
      </div>
    </div>
  );
}

function DockButton({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg',
        active ? 'text-white' : 'text-white/60 hover:text-white',
      )}
    >
      <span className="text-base font-bold">{value}</span>
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </button>
  );
}

function BulletPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

function RecoveryStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full bg-white/15 inline-flex items-center justify-center text-xs font-bold flex-shrink-0">
        {n}
      </span>
      <span className="text-white/90 leading-relaxed">{children}</span>
    </li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'warning' | 'error';
}) {
  return (
    <div className="bg-gray-50 rounded-lg py-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p
        className={cn(
          'text-xl font-bold tabular-nums mt-1',
          tone === 'error' ? 'text-status-error' : tone === 'warning' ? 'text-status-warning' : 'text-dark',
        )}
      >
        {value}
      </p>
    </div>
  );
}

// Avoid unused-prop lint warning in QueuedScan signature
export type { QueuedScan };
