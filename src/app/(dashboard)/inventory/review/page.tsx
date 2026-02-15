'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileSearch,
  Upload,
  CheckCircle2,
  XCircle,
  RotateCcw,
  FileText,
  Sparkles,
  TrendingUp,
  PenLine,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/ui/KpiCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ---------- Types ----------

type DocStatus = 'PENDING' | 'EXTRACTED' | 'APPROVED' | 'REJECTED';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

interface ExtractedField {
  label: string;
  value: string;
  confidence: Confidence;
  editable: boolean;
}

interface ExtractedLineItem {
  id: string;
  productName: string;
  productNameConfidence: Confidence;
  sku: string;
  skuConfidence: Confidence;
  qty: number;
  qtyConfidence: Confidence;
  unitCost: number;
  unitCostConfidence: Confidence;
}

interface DocumentItem {
  id: string;
  documentName: string;
  supplierName: string;
  uploadDate: string;
  status: DocStatus;
  confidence: Confidence;
  extractedFields: ExtractedField[];
  extractedLines: ExtractedLineItem[];
}

// ---------- Mock Data ----------

const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc-1',
    documentName: 'PO_Confirmation_Pacific_Feb2026.pdf',
    supplierName: 'Pacific Wholesale Distribution',
    uploadDate: '2026-02-14',
    status: 'EXTRACTED',
    confidence: 'HIGH',
    extractedFields: [
      { label: 'Supplier', value: 'Pacific Wholesale Distribution', confidence: 'HIGH', editable: true },
      { label: 'PO Number', value: 'PO-2026-0041', confidence: 'HIGH', editable: true },
      { label: 'Document Type', value: 'PO Confirmation', confidence: 'HIGH', editable: false },
      { label: 'Expected Date', value: '2026-02-20', confidence: 'MEDIUM', editable: true },
      { label: 'Carrier', value: 'FedEx Freight', confidence: 'LOW', editable: true },
    ],
    extractedLines: [
      { id: 'el-1', productName: 'RAZ CA6000 Disposable Vape - Blue Razz', productNameConfidence: 'HIGH', sku: 'RAZ-CA6K-BR', skuConfidence: 'HIGH', qty: 100, qtyConfidence: 'HIGH', unitCost: 8.99, unitCostConfidence: 'HIGH' },
      { id: 'el-2', productName: 'Fume Infinity Disposable', productNameConfidence: 'MEDIUM', sku: 'FUME-INF-SB', skuConfidence: 'HIGH', qty: 80, qtyConfidence: 'HIGH', unitCost: 7.50, unitCostConfidence: 'MEDIUM' },
      { id: 'el-3', productName: 'ZYN Pouches Wintergreen', productNameConfidence: 'LOW', sku: '', skuConfidence: 'LOW', qty: 200, qtyConfidence: 'HIGH', unitCost: 3.25, unitCostConfidence: 'HIGH' },
    ],
  },
  {
    id: 'doc-2',
    documentName: 'Invoice_NatTobacco_0038.pdf',
    supplierName: 'National Tobacco Supply Co.',
    uploadDate: '2026-02-13',
    status: 'EXTRACTED',
    confidence: 'MEDIUM',
    extractedFields: [
      { label: 'Supplier', value: 'National Tobacco Supply', confidence: 'MEDIUM', editable: true },
      { label: 'PO Number', value: 'PO-2026-0038', confidence: 'HIGH', editable: true },
      { label: 'Document Type', value: 'Invoice', confidence: 'HIGH', editable: false },
      { label: 'Expected Date', value: '2026-02-18', confidence: 'LOW', editable: true },
    ],
    extractedLines: [
      { id: 'el-4', productName: 'Backwoods Cigars - Honey Berry', productNameConfidence: 'HIGH', sku: 'BW-HB-8PK', skuConfidence: 'HIGH', qty: 50, qtyConfidence: 'MEDIUM', unitCost: 42.00, unitCostConfidence: 'HIGH' },
    ],
  },
  {
    id: 'doc-3',
    documentName: 'ASN_SmokeWave_Feb.pdf',
    supplierName: 'SmokeWave Distributors',
    uploadDate: '2026-02-12',
    status: 'APPROVED',
    confidence: 'HIGH',
    extractedFields: [],
    extractedLines: [],
  },
  {
    id: 'doc-4',
    documentName: 'Invoice_Empire_Glass_Jan.pdf',
    supplierName: 'Empire Glass & Accessories',
    uploadDate: '2026-02-11',
    status: 'REJECTED',
    confidence: 'LOW',
    extractedFields: [],
    extractedLines: [],
  },
  {
    id: 'doc-5',
    documentName: 'PO_Delta_Vape_Supply.pdf',
    supplierName: 'Delta Vape Supply',
    uploadDate: '2026-02-10',
    status: 'PENDING',
    confidence: 'MEDIUM',
    extractedFields: [],
    extractedLines: [],
  },
];

const MOCK_STATS = {
  autoAcceptRate: 72,
  avgCorrections: 1.3,
  totalReviewed: 48,
};

// ---------- Helpers ----------

function getStatusBadge(status: DocStatus) {
  const config: Record<DocStatus, { variant: 'default' | 'info' | 'success' | 'error'; label: string }> = {
    PENDING: { variant: 'default', label: 'Pending' },
    EXTRACTED: { variant: 'info', label: 'Ready for Review' },
    APPROVED: { variant: 'success', label: 'Approved' },
    REJECTED: { variant: 'error', label: 'Rejected' },
  };
  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function getConfidenceBadge(confidence: Confidence) {
  const config: Record<Confidence, { variant: 'success' | 'warning' | 'error'; label: string }> = {
    HIGH: { variant: 'success', label: 'High' },
    MEDIUM: { variant: 'warning', label: 'Medium' },
    LOW: { variant: 'error', label: 'Low' },
  };
  const { variant, label } = config[confidence];
  return <Badge variant={variant}>{label}</Badge>;
}

function getConfidenceFieldStyle(confidence: Confidence): string {
  switch (confidence) {
    case 'HIGH':
      return 'border-gray-300';
    case 'MEDIUM':
      return 'border-status-warning';
    case 'LOW':
      return 'border-status-error bg-yellow-50';
  }
}

// ---------- Loading Skeleton ----------

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10" variant="rectangular" />
        <Skeleton className="w-64 h-8" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" variant="rectangular" />
        ))}
      </div>
      <Skeleton className="h-40" variant="rectangular" />
      <Skeleton className="h-64" variant="rectangular" />
    </div>
  );
}

// ---------- Main Page ----------

export default function DocumentReviewPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentItem[]>(MOCK_DOCUMENTS);
  const [expandedDocId, setExpandedDocId] = useState<string | null>('doc-1');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const toggleExpanded = (id: string) => {
    setExpandedDocId((prev) => (prev === id ? null : id));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    toast.info('Document uploaded. Click "Extract with AI" to process.');
  };

  const handleExtract = async () => {
    setIsExtracting(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsExtracting(false);
    toast.success('AI extraction complete. Review the results below.');
  };

  const handleApprove = (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: 'APPROVED' as DocStatus } : d)),
    );
    toast.success('Document approved and receipt created!');
    setExpandedDocId(null);
  };

  const handleReject = (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: 'REJECTED' as DocStatus } : d)),
    );
    toast.error('Document rejected.');
    setExpandedDocId(null);
  };

  const handleReExtract = async (docId: string) => {
    setIsExtracting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsExtracting(false);
    toast.info('Re-extraction complete. Review updated fields.');
  };

  const updateExtractedField = (docId: string, fieldIdx: number, newValue: string) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        const updatedFields = [...d.extractedFields];
        updatedFields[fieldIdx] = { ...updatedFields[fieldIdx], value: newValue };
        return { ...d, extractedFields: updatedFields };
      }),
    );
  };

  if (isLoading) return <PageSkeleton />;

  if (error) {
    return <ErrorBanner message={error} onRetry={() => window.location.reload()} />;
  }

  const extractedDocs = documents.filter((d) => d.status === 'EXTRACTED');
  const pendingDocs = documents.filter((d) => d.status === 'PENDING');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-teal/10 rounded-lg flex items-center justify-center">
          <FileSearch className="h-5 w-5 text-brand-teal" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-dark">Document Review Queue</h1>
          <p className="text-sm text-gray-500">AI-powered extraction and human verification</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Auto-Accept Rate"
          value={`${MOCK_STATS.autoAcceptRate}%`}
          icon={TrendingUp}
          change={{ value: 3.5, label: 'vs last month' }}
        />
        <KpiCard
          title="Avg Corrections per Doc"
          value={MOCK_STATS.avgCorrections}
          icon={PenLine}
          change={{ value: -0.4, label: 'improving' }}
        />
        <KpiCard
          title="Total Reviewed"
          value={MOCK_STATS.totalReviewed}
          icon={Eye}
          change={{ value: 12, label: 'this month' }}
        />
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
              isDragOver
                ? 'border-brand-teal bg-brand-teal/5'
                : 'border-gray-300 hover:border-brand-teal/50',
            )}
          >
            <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-dark mb-1">
              Drag and drop your document here
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Supports PDF, images, and email files (ASN, Invoice, PO Confirmation)
            </p>
            <Button variant="outline" size="sm">
              Browse Files
            </Button>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              leftIcon={<Sparkles className="h-4 w-4" />}
              onClick={handleExtract}
              isLoading={isExtracting}
              className="text-brand-teal hover:bg-brand-teal/10"
            >
              Extract with AI
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Review Queue Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-teal" />
            <h2 className="text-lg font-semibold text-dark">Review Queue</h2>
            <Badge variant="default">{documents.length}</Badge>
          </div>
        </div>

        {documents.length === 0 ? (
          <EmptyState
            icon="document"
            title="No documents in queue"
            description="Upload a document to get started with AI extraction."
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {documents.map((doc) => {
              const isExpanded = expandedDocId === doc.id;
              const canExpand = doc.status === 'EXTRACTED' && doc.extractedFields.length > 0;

              return (
                <div key={doc.id}>
                  {/* Row */}
                  <div
                    className={cn(
                      'flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors',
                      canExpand && 'cursor-pointer',
                    )}
                    onClick={() => canExpand && toggleExpanded(doc.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-dark truncate">{doc.documentName}</p>
                      <p className="text-xs text-gray-500">{doc.supplierName}</p>
                    </div>
                    <div className="text-xs text-gray-400">{doc.uploadDate}</div>
                    <div>{getStatusBadge(doc.status)}</div>
                    <div>{getConfidenceBadge(doc.confidence)}</div>
                    {canExpand && (
                      <div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && canExpand && (
                    <div className="px-6 pb-6 bg-gray-50/50 border-t border-gray-100">
                      {/* Extracted Fields */}
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-dark mb-3">Extracted Fields</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {doc.extractedFields.map((field, idx) => (
                            <div key={field.label}>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                {field.label}
                                <span className="ml-2">
                                  {getConfidenceBadge(field.confidence)}
                                </span>
                              </label>
                              {field.editable ? (
                                <input
                                  type="text"
                                  value={field.value}
                                  onChange={(e) =>
                                    updateExtractedField(doc.id, idx, e.target.value)
                                  }
                                  className={cn(
                                    'w-full text-sm py-2 px-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/50',
                                    getConfidenceFieldStyle(field.confidence),
                                  )}
                                />
                              ) : (
                                <p className="text-sm py-2 px-3 bg-gray-100 rounded-md text-gray-600">
                                  {field.value}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Extracted Line Items */}
                      {doc.extractedLines.length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-sm font-semibold text-dark mb-3">Extracted Line Items</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-white">
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">SKU</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Qty</th>
                                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Unit Cost</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {doc.extractedLines.map((line) => (
                                  <tr key={line.id} className="bg-white">
                                    <td className="px-3 py-2">
                                      <input
                                        type="text"
                                        defaultValue={line.productName}
                                        className={cn(
                                          'w-full text-sm py-1 px-2 border rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/50',
                                          getConfidenceFieldStyle(line.productNameConfidence),
                                        )}
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="text"
                                        defaultValue={line.sku}
                                        className={cn(
                                          'w-full text-sm font-mono py-1 px-2 border rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/50',
                                          getConfidenceFieldStyle(line.skuConfidence),
                                        )}
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <input
                                        type="number"
                                        defaultValue={line.qty}
                                        className={cn(
                                          'w-20 text-sm font-mono text-center py-1 px-2 border rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/50',
                                          getConfidenceFieldStyle(line.qtyConfidence),
                                        )}
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <input
                                        type="number"
                                        step="0.01"
                                        defaultValue={line.unitCost}
                                        className={cn(
                                          'w-24 text-sm font-mono text-right py-1 px-2 border rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/50',
                                          getConfidenceFieldStyle(line.unitCostConfidence),
                                        )}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="mt-6 flex items-center gap-3">
                        <Button
                          variant="ghost"
                          className="bg-success text-white hover:bg-success/90"
                          leftIcon={<CheckCircle2 className="h-4 w-4" />}
                          onClick={() => handleApprove(doc.id)}
                        >
                          Approve & Create Receipt
                        </Button>
                        <Button
                          variant="danger"
                          leftIcon={<XCircle className="h-4 w-4" />}
                          onClick={() => handleReject(doc.id)}
                        >
                          Reject
                        </Button>
                        <Button
                          variant="ghost"
                          leftIcon={<RotateCcw className="h-4 w-4" />}
                          onClick={() => handleReExtract(doc.id)}
                          isLoading={isExtracting}
                          className="text-brand-teal hover:bg-brand-teal/10"
                        >
                          Re-Extract
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
