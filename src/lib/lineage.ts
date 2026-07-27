/**
 * Data Lineage Tracking System
 *
 * Every record in WholesaleHub can trace back to its source document
 * through a full transformation chain. This module creates, queries,
 * and visualises those chains.
 *
 * Lineage records are immutable once written.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** How the data was transformed at each step. */
export const TransformationType = {
  CREATED: 'CREATED',
  EXTRACTED: 'EXTRACTED',
  VALIDATED: 'VALIDATED',
  CORRECTED: 'CORRECTED',
  ENRICHED: 'ENRICHED',
  MERGED: 'MERGED',
} as const;
export type TransformationType = (typeof TransformationType)[keyof typeof TransformationType];

/** Where the data originally came from. */
export const SourceType = {
  DOCUMENT: 'DOCUMENT',
  API_WEBHOOK: 'API_WEBHOOK',
  MANUAL_ENTRY: 'MANUAL_ENTRY',
  AI_EXTRACTION: 'AI_EXTRACTION',
  ETL_SYNC: 'ETL_SYNC',
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

/** What evidence backs up this lineage step. */
export const EvidenceType = {
  ORIGINAL_DOCUMENT: 'ORIGINAL_DOCUMENT',
  BARCODE_SCAN: 'BARCODE_SCAN',
  HUMAN_REVIEW: 'HUMAN_REVIEW',
  AI_EXTRACTION: 'AI_EXTRACTION',
} as const;
export type EvidenceType = (typeof EvidenceType)[keyof typeof EvidenceType];

// ─── INTERFACES ───────────────────────────────────────────────────────────────

export interface LineageNode {
  id: string;
  entityType: string;
  entityId: string;
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  transformationType: string;
  transformationDetails: Record<string, unknown> | null;
  evidenceType: string | null;
  evidenceUrl: string | null;
  evidenceHash: string | null;
  parentLineageId: string | null;
  createdBy: string;
  createdAt: Date;
  children?: LineageNode[];
}

export interface LineageTree {
  root: LineageNode;
  depth: number;
  totalNodes: number;
}

export interface CreateLineageParams {
  entityType: string;
  entityId: string;
  sourceType: SourceType;
  sourceId?: string;
  sourceUrl?: string;
  transformationType: TransformationType;
  transformationDetails?: Record<string, unknown>;
  evidenceType?: EvidenceType;
  evidenceUrl?: string;
  evidenceHash?: string;
  parentLineageId?: string;
  createdBy: string;
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * Create a new immutable lineage record.
 *
 * @param params - All the fields that describe this lineage step.
 * @returns The newly created DataLineage row.
 */
export async function createLineageRecord(params: CreateLineageParams) {
  return prisma.dataLineage.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      sourceUrl: params.sourceUrl ?? null,
      transformationType: params.transformationType,
      transformationDetails: (params.transformationDetails ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      evidenceType: params.evidenceType ?? null,
      evidenceUrl: params.evidenceUrl ?? null,
      evidenceHash: params.evidenceHash ?? null,
      parentLineageId: params.parentLineageId ?? null,
      createdBy: params.createdBy,
    },
  });
}

// ─── READ: CHAIN ──────────────────────────────────────────────────────────────

/**
 * Retrieve the full transformation chain for an entity by walking
 * `parentLineageId` links from the most recent record back to the
 * original source.
 *
 * The returned array is ordered root-first (oldest ancestor at index 0,
 * the target entity record last).
 */
export async function getLineageChain(
  entityType: string,
  entityId: string,
): Promise<LineageNode[]> {
  // 1. Find all lineage records that belong to this entity.
  const directRecords = await prisma.dataLineage.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' },
  });

  if (directRecords.length === 0) return [];

  // 2. Walk parent links to collect the full chain.
  const visited = new Set<string>();
  const chain: LineageNode[] = [];

  // Recursive helper that prepends ancestors.
  const walkUp = async (parentId: string | null) => {
    if (!parentId || visited.has(parentId)) return;
    visited.add(parentId);

    const parent = await prisma.dataLineage.findUnique({
      where: { id: parentId },
    });

    if (!parent) return;

    // Walk further up first so ancestors appear earlier.
    await walkUp(parent.parentLineageId);

    chain.push(toNode(parent));
  };

  // Walk up from the earliest direct record's parent.
  const earliestParent = directRecords[0].parentLineageId;
  await walkUp(earliestParent);

  // 3. Append the direct records themselves.
  for (const record of directRecords) {
    if (!visited.has(record.id)) {
      visited.add(record.id);
      chain.push(toNode(record));
    }
  }

  return chain;
}

// ─── READ: TREE ───────────────────────────────────────────────────────────────

/**
 * Build a tree structure from the lineage chain.
 *
 * The root is the earliest ancestor. Each node may contain a `children`
 * array of subsequent transformation steps.
 */
export async function getLineageTree(
  entityType: string,
  entityId: string,
): Promise<LineageTree | null> {
  // Fetch all lineage records that are reachable from this entity.
  const chain = await getLineageChain(entityType, entityId);

  if (chain.length === 0) return null;

  // Also fetch any child records that descend from records in the chain.
  const chainIds = new Set(chain.map((n) => n.id));
  const childRecords = await prisma.dataLineage.findMany({
    where: { parentLineageId: { in: [...chainIds] } },
    orderBy: { createdAt: 'asc' },
  });

  // Merge children that are not already in the chain.
  const allNodes: LineageNode[] = [...chain];
  for (const child of childRecords) {
    if (!chainIds.has(child.id)) {
      chainIds.add(child.id);
      allNodes.push(toNode(child));
    }
  }

  // Index nodes by id.
  const nodeMap = new Map<string, LineageNode>();
  for (const node of allNodes) {
    node.children = [];
    nodeMap.set(node.id, node);
  }

  // Assemble tree.
  let root: LineageNode | undefined;
  for (const node of allNodes) {
    if (node.parentLineageId && nodeMap.has(node.parentLineageId)) {
      const parent = nodeMap.get(node.parentLineageId)!;
      parent.children = parent.children ?? [];
      parent.children.push(node);
    } else if (!root) {
      root = node;
    }
  }

  // If for some reason we did not identify a root, pick the first.
  if (!root) root = allNodes[0];

  const depth = computeDepth(root);
  const totalNodes = allNodes.length;

  return { root, depth, totalNodes };
}

// ─── QUERY HELPERS ────────────────────────────────────────────────────────────

/**
 * List all lineage records that were produced via a specific source type.
 * Useful for auditing (e.g., "show me everything that came from AI extraction").
 */
export async function getLineageBySourceType(
  sourceType: string,
  options?: { limit?: number; offset?: number },
): Promise<{ records: LineageNode[]; total: number }> {
  const [records, total] = await Promise.all([
    prisma.dataLineage.findMany({
      where: { sourceType },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    }),
    prisma.dataLineage.count({ where: { sourceType } }),
  ]);

  return {
    records: records.map(toNode),
    total,
  };
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

/** Map a Prisma DataLineage row to the public LineageNode shape. */
function toNode(row: {
  id: string;
  entityType: string;
  entityId: string;
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  transformationType: string;
  transformationDetails: unknown;
  evidenceType: string | null;
  evidenceUrl: string | null;
  evidenceHash: string | null;
  parentLineageId: string | null;
  createdBy: string;
  createdAt: Date;
}): LineageNode {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceUrl: row.sourceUrl,
    transformationType: row.transformationType,
    transformationDetails: (row.transformationDetails as Record<string, unknown>) ?? null,
    evidenceType: row.evidenceType,
    evidenceUrl: row.evidenceUrl,
    evidenceHash: row.evidenceHash,
    parentLineageId: row.parentLineageId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/** Compute depth of a tree rooted at `node`. */
function computeDepth(node: LineageNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(computeDepth));
}
