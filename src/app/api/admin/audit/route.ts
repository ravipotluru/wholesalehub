/**
 * Admin Audit Trail API
 *
 * GET /api/admin/audit — list audit events with filtering and pagination
 *
 * Query params:
 *   entityType — ORDER | PRODUCT | RECEIPT | USER | PRICING
 *   action     — CREATE | UPDATE | DELETE | STATUS_CHANGE | LOGIN
 *   actorId    — filter by actor email or name
 *   from       — ISO date string (start of range)
 *   to         — ISO date string (end of range)
 *   traceId    — filter by trace ID
 *   page       — page number (default 1)
 *   limit      — items per page (default 25, max 100)
 *
 * Auth: ADMIN or ANALYST roles only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';

/** Allowed role set for this endpoint */
const ALLOWED_ROLES = new Set(['ADMIN', 'ANALYST']);

// ─── Types ───

interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  actorType: 'USER' | 'SYSTEM' | 'API';
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'LOGIN';
  entityType: 'ORDER' | 'PRODUCT' | 'RECEIPT' | 'USER' | 'PRICING';
  entityId: string;
  traceId: string;
  changedFields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

// ─── Mock Data ───

function generateMockAuditEvents(): AuditEvent[] {
  const actors = ['admin@wholesalehub.com', 'john.smith@retailer.com', 'SYSTEM', 'sarah.ops@wholesalehub.com', 'API_WEBHOOK', 'mike.warehouse@wholesalehub.com'];
  const actorTypes: ('USER' | 'SYSTEM' | 'API')[] = ['USER', 'USER', 'SYSTEM', 'USER', 'API', 'USER'];
  const actions: AuditEvent['action'][] = ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN'];
  const entityTypes: AuditEvent['entityType'][] = ['ORDER', 'PRODUCT', 'RECEIPT', 'USER', 'PRICING'];
  const fieldSets = [
    ['status'],
    ['wholesalePrice', 'msrp'],
    ['stockQuantity'],
    ['email', 'name'],
    ['status', 'shipmentDate'],
    ['quantity', 'receivedBy'],
    ['role', 'permissions'],
    ['promoPrice', 'onPromotion'],
  ];

  const events: AuditEvent[] = [];
  const now = Date.now();
  const traceIds = ['trc_a1b2c3', 'trc_d4e5f6', 'trc_g7h8i9', 'trc_j0k1l2', 'trc_m3n4o5'];

  for (let i = 0; i < 47; i++) {
    const actorIdx = i % actors.length;
    const action = actions[i % actions.length];
    const entityType = entityTypes[i % entityTypes.length];
    const changedFields = fieldSets[i % fieldSets.length];
    const traceId = traceIds[i % traceIds.length];

    const before: Record<string, unknown> | null = action === 'CREATE' || action === 'LOGIN' ? null : {
      [changedFields[0]]: action === 'STATUS_CHANGE' ? 'PENDING' : action === 'UPDATE' ? 12.99 : 'old_value',
      ...(changedFields[1] ? { [changedFields[1]]: 'previous_value' } : {}),
    };

    const after: Record<string, unknown> | null = action === 'DELETE' || action === 'LOGIN' ? null : {
      [changedFields[0]]: action === 'STATUS_CHANGE' ? 'CONFIRMED' : action === 'CREATE' ? 'new_record' : 15.49,
      ...(changedFields[1] ? { [changedFields[1]]: 'updated_value' } : {}),
    };

    events.push({
      id: `aud_${String(i + 1).padStart(4, '0')}`,
      timestamp: new Date(now - i * 3600000 * (1 + Math.random())).toISOString(),
      actor: actors[actorIdx],
      actorType: actorTypes[actorIdx],
      action,
      entityType,
      entityId: `${entityType.toLowerCase()}_${String(100 + i).padStart(4, '0')}`,
      traceId,
      changedFields,
      before,
      after,
    });
  }

  return events;
}

const ALL_MOCK_EVENTS = generateMockAuditEvents();

// ─── GET ───

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.role;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const action = searchParams.get('action');
    const actorId = searchParams.get('actorId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const traceId = searchParams.get('traceId');
    const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') ?? '25', 10) || 25, 1),
      100,
    );

    // Filter
    let filtered = [...ALL_MOCK_EVENTS];

    if (entityType) {
      filtered = filtered.filter((e) => e.entityType === entityType.toUpperCase());
    }
    if (action) {
      filtered = filtered.filter((e) => e.action === action.toUpperCase());
    }
    if (actorId) {
      const q = actorId.toLowerCase();
      filtered = filtered.filter((e) => e.actor.toLowerCase().includes(q));
    }
    if (traceId) {
      filtered = filtered.filter((e) => e.traceId === traceId);
    }
    if (from) {
      const fromMs = new Date(from).getTime();
      if (!isNaN(fromMs)) {
        filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= fromMs);
      }
    }
    if (to) {
      const toMs = new Date(to).getTime() + 86400000; // inclusive of the "to" day
      if (!isNaN(toMs)) {
        filtered = filtered.filter((e) => new Date(e.timestamp).getTime() < toMs);
      }
    }

    // Paginate
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);

    logger.info({
      event: 'audit_api_list',
      userId: user.id,
      filters: { entityType, action, actorId, traceId, from, to },
      page,
      limit,
      total,
    });

    return NextResponse.json({
      data: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    logger.error({
      event: 'audit_api_get_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to fetch audit events' },
      { status: 500 },
    );
  }
}
