/**
 * Admin data-lineage query helpers.
 *
 * The DB stores lineage as a flat `DataLineage` table with parent/child
 * pointers. The UI consumes a "chain" — a flat ordered list of nodes
 * for one entity plus a derived source-document summary. This module
 * does the mapping.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface LineageQuery {
  entityType: string;
  entityId: string;
  /** Optional source-type filter applied after the DB load. */
  sourceType?: string;
}

export interface LineageNodeDto {
  id: string;
  transformationType: string;
  sourceType: string;
  timestamp: string;
  createdBy: string;
  transformationDetails: Record<string, unknown>;
  evidenceLink: string | null;
}

export interface LineageSourceDocument {
  name: string;
  hash: string;
  url: string;
  uploadedAt: string;
}

export interface LineageChainDto {
  entityType: string;
  entityId: string;
  entityName: string;
  nodes: LineageNodeDto[];
  sourceDocument: LineageSourceDocument | null;
}

/** Friendly labels for the entity-name field consumed by the UI. */
const ENTITY_NAME_PREFIX: Record<string, string> = {
  RECEIPT: 'Receipt',
  ORDER: 'Order',
  PRODUCT: 'Product',
  PRICING: 'Pricing',
};

/** Valid entity types for input validation. */
export const VALID_LINEAGE_ENTITY_TYPES = new Set([
  'RECEIPT',
  'ORDER',
  'PRODUCT',
  'PRICING',
]);

/** Convert one DataLineage row to the DTO the UI consumes. */
export function mapLineageRow(row: {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  transformationType: string;
  transformationDetails: Prisma.JsonValue | null;
  evidenceUrl: string | null;
  createdBy: string;
  createdAt: Date;
}): LineageNodeDto {
  const details =
    row.transformationDetails && typeof row.transformationDetails === 'object'
      ? (row.transformationDetails as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    transformationType: row.transformationType,
    sourceType: row.sourceType,
    timestamp: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    transformationDetails: details,
    evidenceLink: row.evidenceUrl ?? row.sourceUrl ?? null,
  };
}

/**
 * Friendly entity-name string. Uses the prefix table when known and
 * falls back to a generic label otherwise — same behaviour the mock
 * implementation had so the UI can keep its title rendering.
 */
export function buildEntityName(entityType: string, entityId: string): string {
  const prefix = ENTITY_NAME_PREFIX[entityType];
  if (prefix) {
    return `${prefix} #${entityId}`;
  }
  return `Entity ${entityId}`;
}

/**
 * Build a "source document" summary from the chain's first
 * `CREATED`/`DOCUMENT`-type node, when present. Returns null otherwise.
 */
export function deriveSourceDocument(
  rawRoot: {
    sourceType: string;
    sourceUrl: string | null;
    evidenceUrl: string | null;
    evidenceHash: string | null;
    transformationDetails: Prisma.JsonValue | null;
    createdAt: Date;
  } | null,
): LineageSourceDocument | null {
  if (!rawRoot) return null;
  if (!rawRoot.sourceUrl && !rawRoot.evidenceUrl) return null;

  const url = rawRoot.evidenceUrl ?? rawRoot.sourceUrl ?? '';
  const name = url.split('/').pop() || url;
  return {
    name,
    hash: rawRoot.evidenceHash ?? '',
    url,
    uploadedAt: rawRoot.createdAt.toISOString(),
  };
}

/**
 * Look up the lineage chain for a single entity. Nodes are returned
 * oldest-first to match the timeline order the UI renders.
 *
 * Uses the `(entityType, entityId)` index already on the table.
 */
export async function getLineageChain(
  query: LineageQuery,
): Promise<LineageChainDto> {
  const entityType = query.entityType.toUpperCase();

  const rows = await prisma.dataLineage.findMany({
    where: {
      entityType,
      entityId: query.entityId,
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });

  const nodes = rows.map(mapLineageRow);

  // The "source document" mirrors the original DOCUMENT/CREATED node if
  // one exists. We fetch separately when sourceType filtered the rows
  // out so we still get the source-document summary on the page.
  let rootRow: typeof rows[number] | undefined = rows.find(
    (r) => r.transformationType === 'CREATED' && (r.sourceUrl || r.evidenceUrl),
  );
  if (!rootRow && query.sourceType) {
    const fallback = await prisma.dataLineage.findFirst({
      where: { entityType, entityId: query.entityId, transformationType: 'CREATED' },
      orderBy: { createdAt: 'asc' },
    });
    rootRow = fallback ?? undefined;
  }

  return {
    entityType,
    entityId: query.entityId,
    entityName: buildEntityName(entityType, query.entityId),
    nodes,
    sourceDocument: deriveSourceDocument(rootRow ?? null),
  };
}
