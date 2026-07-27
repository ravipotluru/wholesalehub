'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GitBranch,
  Plus,
  Cpu,
  CheckCircle,
  Edit,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Search,
  FileText,
  Hash,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, formatDateTime } from '@/lib/utils';

// ---------- Types ----------
interface LineageNode {
  id: string;
  transformationType: 'CREATED' | 'EXTRACTED' | 'VALIDATED' | 'CORRECTED' | 'ENRICHED';
  sourceType: string;
  timestamp: string;
  createdBy: string;
  transformationDetails: Record<string, unknown>;
  evidenceLink: string | null;
}

interface LineageChain {
  entityType: string;
  entityId: string;
  entityName: string;
  nodes: LineageNode[];
  sourceDocument: {
    name: string;
    hash: string;
    url: string;
    uploadedAt: string;
  } | null;
}

// ---------- Mock Data ----------
function generateMockLineage(entityType: string, entityId: string): LineageChain {
  const nodes: LineageNode[] = [
    {
      id: 'ln_001',
      transformationType: 'CREATED',
      sourceType: 'PDF_UPLOAD',
      timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
      createdBy: 'sarah.ops@wholesalehub.com',
      transformationDetails: {
        fileName: 'invoice_2024_march.pdf',
        fileSize: '2.4MB',
        mimeType: 'application/pdf',
      },
      evidenceLink: '/documents/invoice_2024_march.pdf',
    },
    {
      id: 'ln_002',
      transformationType: 'EXTRACTED',
      sourceType: 'AI_DOCUMENT_EXTRACTION',
      timestamp: new Date(Date.now() - 86400000 * 3 + 60000).toISOString(),
      createdBy: 'SYSTEM',
      transformationDetails: {
        model: 'anthropic.claude-3-sonnet',
        promptVersion: 'v2.4',
        confidence: 0.94,
        fieldsExtracted: ['productName', 'quantity', 'unitPrice', 'total'],
        rawOutput: { productName: 'RAW Classic King Size', quantity: 500, unitPrice: 2.15 },
      },
      evidenceLink: null,
    },
    {
      id: 'ln_003',
      transformationType: 'VALIDATED',
      sourceType: 'ZOD_SCHEMA_VALIDATION',
      timestamp: new Date(Date.now() - 86400000 * 3 + 120000).toISOString(),
      createdBy: 'SYSTEM',
      transformationDetails: {
        schema: 'ReceiptLineSchema',
        validationPassed: true,
        warningsCount: 0,
        attempt: 1,
      },
      evidenceLink: null,
    },
    {
      id: 'ln_004',
      transformationType: 'CORRECTED',
      sourceType: 'HUMAN_REVIEW',
      timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
      createdBy: 'mike.warehouse@wholesalehub.com',
      transformationDetails: {
        fieldCorrected: 'quantity',
        originalValue: 500,
        correctedValue: 480,
        reason: 'Physical count mismatch — 20 units short',
      },
      evidenceLink: null,
    },
    {
      id: 'ln_005',
      transformationType: 'ENRICHED',
      sourceType: 'ENTITY_RESOLUTION',
      timestamp: new Date(Date.now() - 86400000 * 2 + 30000).toISOString(),
      createdBy: 'SYSTEM',
      transformationDetails: {
        matchedProduct: 'prod_0342',
        matchConfidence: 0.97,
        matchMethod: 'UPC_BARCODE',
        upc: '716165177784',
        resolvedName: 'RAW Classic King Size Rolling Papers 110mm',
      },
      evidenceLink: null,
    },
  ];

  return {
    entityType,
    entityId,
    entityName: entityType === 'RECEIPT' ? `Receipt #RCP-${entityId}` : `Entity ${entityId}`,
    nodes,
    sourceDocument: {
      name: 'invoice_2024_march.pdf',
      hash: 'sha256:3a7bd3e2360a1f5c8b041d5b4d2c14f14f2e1cb7af6f4a7a0f68e32b4af2c9d1',
      url: '/documents/invoice_2024_march.pdf',
      uploadedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
  };
}

// ---------- Constants ----------
const ENTITY_TYPE_OPTIONS = [
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'ORDER', label: 'Order' },
  { value: 'PRODUCT', label: 'Product' },
  { value: 'PRICING', label: 'Pricing' },
];

const TRANSFORMATION_ICONS: Record<string, typeof Plus> = {
  CREATED: Plus,
  EXTRACTED: Cpu,
  VALIDATED: CheckCircle,
  CORRECTED: Edit,
  ENRICHED: Sparkles,
};

const TRANSFORMATION_COLORS: Record<string, string> = {
  CREATED: 'bg-success/10 text-success border-success/30',
  EXTRACTED: 'bg-brand-blue/10 text-brand-blue border-brand-blue/30',
  VALIDATED: 'bg-brand-teal/10 text-brand-teal border-brand-teal/30',
  CORRECTED: 'bg-brand-orange/10 text-brand-orange border-brand-orange/30',
  ENRICHED: 'bg-status-info/10 text-status-info border-status-info/30',
};

const TRANSFORMATION_DOT_COLORS: Record<string, string> = {
  CREATED: 'bg-success',
  EXTRACTED: 'bg-brand-blue',
  VALIDATED: 'bg-brand-teal',
  CORRECTED: 'bg-brand-orange',
  ENRICHED: 'bg-status-info',
};

// ---------- Node Component ----------
function TimelineNode({ node, isLast }: { node: LineageNode; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TRANSFORMATION_ICONS[node.transformationType] ?? Plus;
  const colorClass = TRANSFORMATION_COLORS[node.transformationType] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  const dotColor = TRANSFORMATION_DOT_COLORS[node.transformationType] ?? 'bg-gray-400';

  return (
    <div className="relative flex gap-4">
      {/* Vertical Line + Dot */}
      <div className="flex flex-col items-center">
        <div className={cn('w-4 h-4 rounded-full border-2 border-white ring-2 ring-gray-200 z-10', dotColor)} />
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 min-h-[24px]" />}
      </div>

      {/* Node Content */}
      <div className={cn('flex-1 mb-6', isLast && 'mb-0')}>
        <Card className={cn('border-l-4', node.transformationType === 'CREATED' ? 'border-l-success' : 'border-l-brand-blue')}>
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex items-center gap-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colorClass)}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border', colorClass)}>
                    {node.transformationType}
                  </span>
                  <Badge variant="default">{node.sourceType.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>{formatDateTime(node.timestamp)}</span>
                  <span className="text-gray-300">|</span>
                  <span>by {node.createdBy === 'SYSTEM' ? (
                    <span className="font-semibold text-brand-teal">SYSTEM</span>
                  ) : (
                    node.createdBy
                  )}</span>
                </div>
              </div>
            </div>
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )}
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Transformation Details</p>
              <pre className="text-xs font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto text-dark">
                {JSON.stringify(node.transformationDetails, null, 2)}
              </pre>
              {node.evidenceLink && (
                <a
                  href={node.evidenceLink}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-teal hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Evidence
                </a>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------- Loading Skeleton ----------
function LineageSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <Skeleton variant="circular" className="w-4 h-4" />
            {i < 3 && <div className="w-0.5 flex-1 bg-gray-200 min-h-[24px]" />}
          </div>
          <div className="flex-1 mb-6">
            <Card>
              <div className="flex items-center gap-3">
                <Skeleton variant="rectangular" className="w-8 h-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-48 h-4" />
                  <Skeleton className="w-32 h-3" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Main Page ----------
export default function DataLineagePage() {
  const [entityType, setEntityType] = useState('RECEIPT');
  const [entityId, setEntityId] = useState('');
  const [searchParams, setSearchParams] = useState<{ entityType: string; entityId: string } | null>(null);

  const {
    data: lineage,
    isLoading,
    error,
    refetch,
  } = useQuery<LineageChain>({
    queryKey: ['admin-lineage', searchParams?.entityType, searchParams?.entityId],
    enabled: !!searchParams,
    queryFn: async () => {
      if (!searchParams) throw new Error('No search params');
      try {
        const res = await fetch(`/api/admin/lineage?entityType=${searchParams.entityType}&entityId=${searchParams.entityId}`);
        if (!res.ok) throw new Error('API not available');
        return res.json();
      } catch {
        return generateMockLineage(searchParams.entityType, searchParams.entityId || '0042');
      }
    },
  });

  const handleTrace = useCallback(() => {
    setSearchParams({ entityType, entityId: entityId || '0042' });
  }, [entityType, entityId]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-teal/10 rounded-lg flex items-center justify-center">
          <GitBranch className="h-5 w-5 text-brand-teal" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-dark">Data Lineage</h1>
          <p className="text-sm text-gray-500">Trace every record back to its source document</p>
        </div>
      </div>

      {/* Search Bar */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Select
              label="Entity Type"
              options={ENTITY_TYPE_OPTIONS}
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </div>
          <div className="w-64">
            <Input
              label="Entity ID"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="e.g. 0042 or receipt_0042"
            />
          </div>
          <Button variant="primary" size="sm" onClick={handleTrace} leftIcon={<Search className="h-4 w-4" />}>
            Trace
          </Button>
        </div>
      </Card>

      {/* Error State */}
      {error && (
        <ErrorBanner
          message="Failed to load lineage data. Showing mock data."
          onRetry={() => refetch()}
        />
      )}

      {/* Empty State (before search) */}
      {!searchParams && !isLoading && (
        <EmptyState
          icon="search"
          title="Search for an entity"
          description="Select an entity type and enter an ID to trace the full transformation chain."
        />
      )}

      {/* Loading */}
      {isLoading && <LineageSkeleton />}

      {/* Lineage Timeline */}
      {lineage && !isLoading && (
        <div className="space-y-6">
          {/* Entity Header */}
          <Card className="bg-brand-blue/5 border-brand-blue/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center">
                <Hash className="h-5 w-5 text-brand-blue" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-dark">{lineage.entityName}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="info">{lineage.entityType}</Badge>
                  <code className="text-xs font-mono text-gray-500">{lineage.entityId}</code>
                </div>
              </div>
            </div>
          </Card>

          {/* Timeline */}
          <div className="pl-2">
            {lineage.nodes.length === 0 ? (
              <EmptyState
                icon="document"
                title="No lineage records"
                description="No transformation history found for this entity."
              />
            ) : (
              lineage.nodes.map((node, i) => (
                <TimelineNode key={node.id} node={node} isLast={i === lineage.nodes.length - 1} />
              ))
            )}
          </div>

          {/* Source Document Evidence */}
          {lineage.sourceDocument && (
            <Card className="border-t-4 border-t-brand-teal">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-brand-teal/10 rounded-lg flex items-center justify-center">
                  <FileText className="h-4 w-4 text-brand-teal" />
                </div>
                <h3 className="text-sm font-semibold text-dark uppercase">Source Evidence</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Document Name</p>
                  <p className="font-medium text-dark">{lineage.sourceDocument.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Uploaded</p>
                  <p className="font-medium text-dark">{formatDateTime(lineage.sourceDocument.uploadedAt)}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-500 mb-1">Content Hash</p>
                  <code className="text-xs font-mono bg-gray-50 rounded px-2 py-1 text-dark break-all">
                    {lineage.sourceDocument.hash}
                  </code>
                </div>
                <div>
                  <a
                    href={lineage.sourceDocument.url}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Source Document
                  </a>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
