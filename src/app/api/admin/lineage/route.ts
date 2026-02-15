/**
 * Admin Data Lineage API
 *
 * GET /api/admin/lineage — get lineage chain for an entity
 *
 * Query params:
 *   entityType  — RECEIPT | ORDER | PRODUCT | PRICING
 *   entityId    — the entity identifier
 *   sourceType  — optional filter by source type
 *
 * Auth: ADMIN or ANALYST roles only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

/** Allowed role set for this endpoint */
const ALLOWED_ROLES = new Set(['ADMIN', 'ANALYST']);

// ─── Types ───

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

// ─── Mock Data ───

function generateMockLineage(entityType: string, entityId: string, sourceType?: string): LineageChain {
  const allNodes: LineageNode[] = [
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
        reason: 'Physical count mismatch - 20 units short',
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

  // Apply sourceType filter if provided
  const nodes = sourceType
    ? allNodes.filter((n) => n.sourceType === sourceType)
    : allNodes;

  const nameMap: Record<string, string> = {
    RECEIPT: `Receipt #RCP-${entityId}`,
    ORDER: `Order #ORD-${entityId}`,
    PRODUCT: `Product #PRD-${entityId}`,
    PRICING: `Pricing #PRC-${entityId}`,
  };

  return {
    entityType,
    entityId,
    entityName: nameMap[entityType] ?? `Entity ${entityId}`,
    nodes,
    sourceDocument: {
      name: 'invoice_2024_march.pdf',
      hash: 'sha256:3a7bd3e2360a1f5c8b041d5b4d2c14f14f2e1cb7af6f4a7a0f68e32b4af2c9d1',
      url: '/documents/invoice_2024_march.pdf',
      uploadedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
  };
}

// ─── GET ───

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as Record<string, unknown>;
    const role = user.role as string;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const entityId = searchParams.get('entityId');
    const sourceType = searchParams.get('sourceType');

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: 'Missing entityType or entityId query parameter' },
        { status: 400 },
      );
    }

    const validEntityTypes = new Set(['RECEIPT', 'ORDER', 'PRODUCT', 'PRICING']);
    if (!validEntityTypes.has(entityType.toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid entityType. Must be one of: ${[...validEntityTypes].join(', ')}` },
        { status: 400 },
      );
    }

    // In production this would query the lineage table.
    // For now, return mock data.
    const lineage = generateMockLineage(
      entityType.toUpperCase(),
      entityId,
      sourceType ?? undefined,
    );

    logger.info({
      event: 'lineage_api_get',
      userId: user.id,
      entityType: entityType.toUpperCase(),
      entityId,
      sourceType,
      nodeCount: lineage.nodes.length,
    });

    return NextResponse.json(lineage);
  } catch (error) {
    logger.error({
      event: 'lineage_api_get_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to fetch lineage data' },
      { status: 500 },
    );
  }
}
