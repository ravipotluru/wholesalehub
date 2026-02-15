'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardPlus,
  Plus,
  Trash2,
  Upload,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, generateReceiptNumber } from '@/lib/utils';
import { toast } from 'sonner';

// ---------- Types ----------

interface LineItemDraft {
  id: string;
  productSearch: string;
  sku: string;
  expectedQty: number;
  unitCost: number;
}

interface ReceiptFormData {
  supplierId: string;
  poNumber: string;
  documentType: string;
  carrier: string;
  trackingNumber: string;
  expectedDate: string;
  notes: string;
}

// ---------- Mock Suppliers ----------

const SUPPLIER_OPTIONS = [
  { value: '', label: 'Select supplier...' },
  { value: 'sup-1', label: 'Pacific Wholesale Distribution' },
  { value: 'sup-2', label: 'National Tobacco Supply Co.' },
  { value: 'sup-3', label: 'SmokeWave Distributors' },
  { value: 'sup-4', label: 'Empire Glass & Accessories' },
  { value: 'sup-5', label: 'Delta Vape Supply' },
];

const DOC_TYPE_OPTIONS = [
  { value: '', label: 'Select type...' },
  { value: 'ASN', label: 'ASN (Advance Shipping Notice)' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'PO_CONFIRM', label: 'PO Confirmation' },
  { value: 'MANUAL', label: 'Manual Entry' },
];

// Mock product lookup for autofill
const PRODUCT_LOOKUP: Record<string, { sku: string; unitCost: number }> = {
  'raz ca6000': { sku: 'RAZ-CA6K-BR', unitCost: 8.99 },
  'fume infinity': { sku: 'FUME-INF-SB', unitCost: 7.50 },
  'zyn 6mg': { sku: 'ZYN-6MG-WG', unitCost: 3.25 },
  'bic lighter': { sku: 'BIC-CL-50PK', unitCost: 32.00 },
  'raw papers': { sku: 'RAW-CL-KS', unitCost: 1.15 },
  'lost mary': { sku: 'LM-OS5K-WM', unitCost: 9.25 },
  'elf bar': { sku: 'ELF-BC5K-MP', unitCost: 8.75 },
  'clipper': { sku: 'CLIP-HEMP-48', unitCost: 45.60 },
};

let lineIdCounter = 0;
function newLineId(): string {
  lineIdCounter += 1;
  return `line-${lineIdCounter}`;
}

// ---------- Main Page ----------

export default function NewReceiptPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ReceiptFormData>({
    supplierId: '',
    poNumber: '',
    documentType: '',
    carrier: '',
    trackingNumber: '',
    expectedDate: '',
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([
    { id: newLineId(), productSearch: '', sku: '', expectedQty: 1, unitCost: 0 },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = (field: keyof ReceiptFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: newLineId(), productSearch: '', sku: '', expectedQty: 1, unitCost: 0 },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItemDraft, value: string | number) => {
    setLineItems((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };

        // Auto-fill SKU and unitCost when product search matches
        if (field === 'productSearch') {
          const searchKey = (value as string).toLowerCase();
          const match = Object.entries(PRODUCT_LOOKUP).find(([key]) =>
            searchKey.includes(key),
          );
          if (match) {
            updated.sku = match[1].sku;
            updated.unitCost = match[1].unitCost;
          }
        }

        return updated;
      }),
    );
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.supplierId) newErrors.supplierId = 'Supplier is required';
    if (!formData.poNumber.trim()) newErrors.poNumber = 'PO Number is required';
    if (!formData.documentType) newErrors.documentType = 'Document type is required';

    const hasValidLine = lineItems.some(
      (l) => l.productSearch.trim() && l.expectedQty > 0,
    );
    if (!hasValidLine) newErrors.lines = 'At least one line item with a product and quantity is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSubmitting(false);

    const receiptNumber = generateReceiptNumber();
    toast.success(`Receipt ${receiptNumber} created successfully!`);
    router.push('/inventory');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/inventory')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-orange/10 rounded-lg flex items-center justify-center">
            <ClipboardPlus className="h-5 w-5 text-brand-orange" />
          </div>
          <h1 className="text-2xl font-bold text-dark">Create New Receipt</h1>
        </div>
      </div>

      {/* Receipt Details Form */}
      <Card>
        <CardHeader>
          <CardTitle>Receipt Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Select
                id="supplier"
                label="Supplier"
                options={SUPPLIER_OPTIONS}
                value={formData.supplierId}
                onChange={(e) => updateField('supplierId', e.target.value)}
                error={errors.supplierId}
              />
            </div>
            <div>
              <Input
                id="poNumber"
                label="PO Number"
                value={formData.poNumber}
                onChange={(e) => updateField('poNumber', e.target.value)}
                placeholder="PO-2026-XXXX"
                error={errors.poNumber}
              />
            </div>
            <div>
              <Select
                id="documentType"
                label="Document Type"
                options={DOC_TYPE_OPTIONS}
                value={formData.documentType}
                onChange={(e) => updateField('documentType', e.target.value)}
                error={errors.documentType}
              />
            </div>
            <div>
              <Input
                id="carrier"
                label="Carrier"
                value={formData.carrier}
                onChange={(e) => updateField('carrier', e.target.value)}
                placeholder="e.g., FedEx Freight"
              />
            </div>
            <div>
              <Input
                id="tracking"
                label="Tracking Number"
                value={formData.trackingNumber}
                onChange={(e) => updateField('trackingNumber', e.target.value)}
                placeholder="Tracking #"
              />
            </div>
            <div>
              <Input
                id="expectedDate"
                label="Expected Date"
                type="date"
                value={formData.expectedDate}
                onChange={(e) => updateField('expectedDate', e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Input
                id="notes"
                label="Notes"
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Any special instructions..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={addLineItem}
            >
              Add Line
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {errors.lines && (
            <ErrorBanner message={errors.lines} className="mb-4" />
          )}

          <div className="space-y-3">
            {/* Header row */}
            <div className="hidden md:grid grid-cols-12 gap-3 px-2 text-xs font-semibold text-gray-500 uppercase">
              <div className="col-span-4">Product</div>
              <div className="col-span-2">SKU</div>
              <div className="col-span-2">Expected Qty</div>
              <div className="col-span-2">Unit Cost</div>
              <div className="col-span-1">Total</div>
              <div className="col-span-1" />
            </div>

            {lineItems.map((line, idx) => (
              <div
                key={line.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center p-3 bg-gray-50 rounded-lg"
              >
                {/* Product search */}
                <div className="md:col-span-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={line.productSearch}
                      onChange={(e) => updateLineItem(line.id, 'productSearch', e.target.value)}
                      placeholder="Search product..."
                      className="w-full text-sm pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
                    />
                  </div>
                </div>

                {/* SKU (auto-filled) */}
                <div className="md:col-span-2">
                  <input
                    type="text"
                    value={line.sku}
                    readOnly
                    placeholder="Auto-fill"
                    className="w-full text-sm font-mono py-2 px-3 border border-gray-200 rounded-md bg-gray-100 text-gray-600"
                  />
                </div>

                {/* Expected Qty */}
                <div className="md:col-span-2">
                  <input
                    type="number"
                    min={1}
                    value={line.expectedQty}
                    onChange={(e) =>
                      updateLineItem(line.id, 'expectedQty', parseInt(e.target.value, 10) || 1)
                    }
                    className="w-full text-sm font-mono py-2 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
                  />
                </div>

                {/* Unit Cost */}
                <div className="md:col-span-2">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={line.unitCost}
                    onChange={(e) =>
                      updateLineItem(line.id, 'unitCost', parseFloat(e.target.value) || 0)
                    }
                    className="w-full text-sm font-mono py-2 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
                  />
                </div>

                {/* Line Total */}
                <div className="md:col-span-1">
                  <span className="text-sm font-mono font-semibold text-dark">
                    ${(line.expectedQty * line.unitCost).toFixed(2)}
                  </span>
                </div>

                {/* Remove */}
                <div className="md:col-span-1 flex justify-end">
                  <button
                    onClick={() => removeLineItem(line.id)}
                    disabled={lineItems.length <= 1}
                    className="p-1.5 hover:bg-status-error/10 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4 text-status-error" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          leftIcon={<ClipboardPlus className="h-4 w-4" />}
          isLoading={isSubmitting}
          onClick={handleSubmit}
          className="w-full sm:w-auto"
        >
          Create Receipt
        </Button>
        <Button
          variant="ghost"
          size="lg"
          leftIcon={<Upload className="h-4 w-4" />}
          onClick={() => router.push('/inventory/review')}
          className="w-full sm:w-auto text-brand-teal hover:bg-brand-teal/10"
        >
          Upload for AI Extraction
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => router.push('/inventory')}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
