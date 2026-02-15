'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, XCircle, ScanBarcode, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------- Types ----------

interface ScanResult {
  barcode: string;
  productName: string;
  sku: string;
  matched: boolean;
  timestamp: string;
}

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptId: string;
  onScanComplete: (barcode: string, productName: string) => void;
}

// ---------- Mock barcode lookup ----------

const BARCODE_CATALOG: Record<string, { productName: string; sku: string }> = {
  '012345678901': { productName: 'RAZ CA6000 Disposable Vape - Blue Razz', sku: 'RAZ-CA6K-BR' },
  '012345678902': { productName: 'Fume Infinity Disposable - Strawberry Banana', sku: 'FUME-INF-SB' },
  '012345678903': { productName: 'ZYN Nicotine Pouches 6mg - Wintergreen', sku: 'ZYN-6MG-WG' },
  '012345678904': { productName: 'BIC Classic Lighter - Assorted 50pk', sku: 'BIC-CL-50PK' },
  '012345678905': { productName: 'RAW Classic Rolling Papers King Size', sku: 'RAW-CL-KS' },
  '012345678906': { productName: 'Lost Mary OS5000 - Watermelon', sku: 'LM-OS5K-WM' },
  '012345678907': { productName: 'Elf Bar BC5000 - Mango Peach', sku: 'ELF-BC5K-MP' },
  '012345678908': { productName: 'Clipper Lighter - Hemp Leaves 48ct', sku: 'CLIP-HEMP-48' },
};

// ---------- Component ----------

export function ScannerModal({ isOpen, onClose, receiptId, onScanComplete }: ScannerModalProps) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [flashColor, setFlashColor] = useState<'green' | 'red' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleScan = useCallback(
    (barcode: string) => {
      if (!barcode.trim()) return;

      const lookup = BARCODE_CATALOG[barcode.trim()];
      const result: ScanResult = {
        barcode: barcode.trim(),
        productName: lookup?.productName ?? 'Unknown Product',
        sku: lookup?.sku ?? 'N/A',
        matched: !!lookup,
        timestamp: new Date().toISOString(),
      };

      setLastResult(result);
      setScanHistory((prev) => [result, ...prev].slice(0, 10));
      setFlashColor(result.matched ? 'green' : 'red');
      setBarcodeInput('');

      if (result.matched) {
        onScanComplete(barcode.trim(), result.productName);
      }

      // Clear flash
      setTimeout(() => setFlashColor(null), 600);
    },
    [onScanComplete],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleScan(barcodeInput);
    }
  };

  const totalScanned = scanHistory.filter((s) => s.matched).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Barcode Scanner" size="lg">
      <div className="space-y-6">
        {/* Receipt context */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <ScanBarcode className="h-4 w-4 text-brand-teal" />
          <span>
            Scanning for receipt <span className="font-mono font-medium text-brand-blue">{receiptId}</span>
          </span>
        </div>

        {/* Barcode input */}
        <div
          className={cn(
            'rounded-xl border-2 p-4 transition-colors duration-300',
            flashColor === 'green'
              ? 'border-success bg-success/5'
              : flashColor === 'red'
                ? 'border-status-error bg-status-error/5'
                : 'border-gray-200',
          )}
        >
          <label className="block text-sm font-medium text-dark mb-2">
            Scan or enter barcode
          </label>
          <input
            ref={inputRef}
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Place cursor here and scan..."
            className="w-full text-2xl font-mono tracking-widest text-center py-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-brand-teal bg-white"
            autoComplete="off"
          />
          <Button
            variant="primary"
            className="w-full mt-3"
            onClick={() => handleScan(barcodeInput)}
            disabled={!barcodeInput.trim()}
          >
            Confirm Scan
          </Button>
        </div>

        {/* Last scan result */}
        {lastResult && (
          <div
            className={cn(
              'rounded-lg border p-4',
              lastResult.matched
                ? 'border-success/30 bg-success/5'
                : 'border-status-error/30 bg-status-error/5',
            )}
          >
            <div className="flex items-start gap-3">
              {lastResult.matched ? (
                <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-6 w-6 text-status-error flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-dark">
                  {lastResult.matched ? 'Match Found' : 'No Match'}
                </p>
                <p className="text-sm text-gray-600 mt-0.5">{lastResult.productName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-mono text-gray-400">{lastResult.barcode}</span>
                  {lastResult.matched && (
                    <span className="text-xs font-mono text-brand-teal">{lastResult.sku}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Running total */}
        <div className="flex items-center justify-center gap-2 py-3 bg-brand-blue/5 rounded-lg">
          <Hash className="h-5 w-5 text-brand-blue" />
          <span className="text-lg font-bold text-brand-blue">{totalScanned}</span>
          <span className="text-sm text-gray-500">items scanned</span>
        </div>

        {/* Scan history */}
        {scanHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-dark mb-3">Recent Scans</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {scanHistory.map((scan, idx) => (
                <div
                  key={`${scan.barcode}-${idx}`}
                  className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg"
                >
                  {scan.matched ? (
                    <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-status-error flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-dark truncate">{scan.productName}</p>
                    <p className="text-xs font-mono text-gray-400">{scan.barcode}</p>
                  </div>
                  <Badge variant={scan.matched ? 'success' : 'error'}>
                    {scan.matched ? 'Matched' : 'No Match'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Done button */}
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>
            Done Scanning
          </Button>
        </div>
      </div>
    </Modal>
  );
}
