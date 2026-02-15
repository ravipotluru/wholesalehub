'use client';

import { useState, useMemo, useCallback, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  ChevronDown,
  ChevronRight,
  Download,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton, TableRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, formatDateTime } from '@/lib/utils';

// ---------- Types ----------
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

interface AuditFilters {
  entityType: string;
  action: string;
  dateFrom: string;
  dateTo: string;
  actor: string;
}

interface AuditResponse {
  data: AuditEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---------- Mock Data ----------
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

// ---------- Constants ----------
const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'All Entity Types' },
  { value: 'ORDER', label: 'Order' },
  { value: 'PRODUCT', label: 'Product' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'USER', label: 'User' },
  { value: 'PRICING', label: 'Pricing' },
];

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'CREATE', label: 'Create' },
  { value: 'UPDATE', label: 'Update' },
  { value: 'DELETE', label: 'Delete' },
  { value: 'STATUS_CHANGE', label: 'Status Change' },
  { value: 'LOGIN', label: 'Login' },
];

const ACTION_BADGE_VARIANT: Record<string, 'success' | 'info' | 'error' | 'warning' | 'default'> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'error',
  STATUS_CHANGE: 'warning',
  LOGIN: 'default',
};

const PAGE_SIZE = 25;

// ---------- Helper Components ----------
function ActionBadge({ action }: { action: string }) {
  const variant = ACTION_BADGE_VARIANT[action] ?? 'default';
  const colorMap: Record<string, string> = {
    CREATE: 'bg-brand-teal/10 text-brand-teal',
    UPDATE: 'bg-brand-blue/10 text-brand-blue',
    DELETE: 'bg-status-error/10 text-status-error',
    STATUS_CHANGE: 'bg-brand-orange/10 text-brand-orange',
    LOGIN: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', colorMap[action] ?? 'bg-gray-100 text-gray-600')}>
      {action.replace('_', ' ')}
    </span>
  );
}

function ActorDisplay({ actor, actorType }: { actor: string; actorType: string }) {
  if (actorType === 'SYSTEM' || actorType === 'API') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-brand-teal" />
        <span className="text-xs font-semibold text-brand-teal uppercase">{actor}</span>
      </span>
    );
  }
  return <span className="text-sm text-dark">{actor}</span>;
}

function JsonDiff({ label, data, changedFields }: { label: string; data: Record<string, unknown> | null; changedFields: string[] }) {
  if (!data) return <div className="text-xs text-gray-400 italic">N/A</div>;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">{label}</p>
      <pre className="text-xs font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto">
        {Object.entries(data).map(([key, value]) => {
          const isChanged = changedFields.includes(key);
          return (
            <div key={key} className={cn(isChanged && 'bg-yellow-100 -mx-3 px-3')}>
              <span className="text-gray-500">&quot;{key}&quot;</span>: <span className="text-brand-blue">{JSON.stringify(value)}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

// ---------- Main Page ----------
export default function AuditTrailPage() {
  const [filters, setFilters] = useState<AuditFilters>({
    entityType: '',
    action: '',
    dateFrom: '',
    dateTo: '',
    actor: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(filters);
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [traceFilter, setTraceFilter] = useState<string | null>(null);

  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useQuery<AuditResponse>({
    queryKey: ['admin-audit', appliedFilters, page, traceFilter],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (appliedFilters.entityType) params.set('entityType', appliedFilters.entityType);
        if (appliedFilters.action) params.set('action', appliedFilters.action);
        if (appliedFilters.dateFrom) params.set('dateFrom', appliedFilters.dateFrom);
        if (appliedFilters.dateTo) params.set('dateTo', appliedFilters.dateTo);
        if (appliedFilters.actor) params.set('actor', appliedFilters.actor);
        if (traceFilter) params.set('traceId', traceFilter);
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));

        const res = await fetch(`/api/admin/audit?${params.toString()}`);
        if (!res.ok) throw new Error('API not available');
        return res.json();
      } catch {
        // Mock fallback with filtering
        let filtered = [...ALL_MOCK_EVENTS];

        if (traceFilter) {
          filtered = filtered.filter((e) => e.traceId === traceFilter);
        }
        if (appliedFilters.entityType) {
          filtered = filtered.filter((e) => e.entityType === appliedFilters.entityType);
        }
        if (appliedFilters.action) {
          filtered = filtered.filter((e) => e.action === appliedFilters.action);
        }
        if (appliedFilters.dateFrom) {
          const from = new Date(appliedFilters.dateFrom).getTime();
          filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= from);
        }
        if (appliedFilters.dateTo) {
          const to = new Date(appliedFilters.dateTo).getTime() + 86400000;
          filtered = filtered.filter((e) => new Date(e.timestamp).getTime() < to);
        }
        if (appliedFilters.actor) {
          const q = appliedFilters.actor.toLowerCase();
          filtered = filtered.filter((e) => e.actor.toLowerCase().includes(q));
        }

        const total = filtered.length;
        const start = (page - 1) * PAGE_SIZE;
        const paged = filtered.slice(start, start + PAGE_SIZE);

        return {
          data: paged,
          pagination: {
            page,
            limit: PAGE_SIZE,
            total,
            totalPages: Math.ceil(total / PAGE_SIZE),
          },
        };
      }
    },
  });

  const events = response?.data ?? [];
  const pagination = response?.pagination;

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({ ...filters });
    setPage(1);
    setTraceFilter(null);
  }, [filters]);

  const handleTraceFilter = useCallback((traceId: string) => {
    setTraceFilter(traceId);
    setPage(1);
  }, []);

  const handleClearTrace = useCallback(() => {
    setTraceFilter(null);
    setPage(1);
  }, []);

  const exportCsv = useCallback(() => {
    const headers = ['Timestamp', 'Actor', 'Action', 'Entity Type', 'Entity ID', 'Changed Fields', 'Trace ID'];
    const rows = events.map((e) => [
      e.timestamp,
      e.actor,
      e.action,
      e.entityType,
      e.entityId,
      e.changedFields.join('; '),
      e.traceId,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark">Audit Trail</h1>
            <p className="text-sm text-gray-500">Immutable event log for all data changes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={exportCsv}>
            Export CSV
          </Button>
          <Button variant="ghost" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={exportJson}>
            Export JSON
          </Button>
        </div>
      </div>

      {/* Trace Filter Banner */}
      {traceFilter && (
        <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-brand-blue" />
            <span className="text-sm text-brand-blue font-medium">
              Filtered by Trace ID: <span className="font-mono">{traceFilter}</span>
            </span>
          </div>
          <button onClick={handleClearTrace} className="text-sm font-medium text-brand-blue hover:underline">
            Clear
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Select
              options={ENTITY_TYPE_OPTIONS}
              value={filters.entityType}
              onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
              placeholder="Entity Type"
            />
          </div>
          <div className="w-44">
            <Select
              options={ACTION_OPTIONS}
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              placeholder="Action"
            />
          </div>
          <div className="w-40">
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              placeholder="From"
            />
          </div>
          <div className="w-40">
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              placeholder="To"
            />
          </div>
          <div className="w-52">
            <Input
              value={filters.actor}
              onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
              placeholder="Search actor..."
            />
          </div>
          <Button variant="primary" size="sm" onClick={handleApplyFilters}>
            Apply Filters
          </Button>
        </div>
      </Card>

      {/* Error State */}
      {error && (
        <ErrorBanner
          message="Failed to load audit events. Showing mock data."
          onRetry={() => refetch()}
        />
      )}

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="table-header w-8" />
                  <th className="table-header">Timestamp</th>
                  <th className="table-header">Actor</th>
                  <th className="table-header">Action</th>
                  <th className="table-header">Entity Type</th>
                  <th className="table-header">Entity ID</th>
                  <th className="table-header">Changed Fields</th>
                  <th className="table-header w-20">Trace</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={8} />
                ))}
              </tbody>
            </table>
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon="search"
            title="No audit events found"
            description="Adjust your filters or check back later for new events."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="table-header w-8" />
                  <th className="table-header">Timestamp</th>
                  <th className="table-header">Actor</th>
                  <th className="table-header">Action</th>
                  <th className="table-header">Entity Type</th>
                  <th className="table-header">Entity ID</th>
                  <th className="table-header">Changed Fields</th>
                  <th className="table-header w-20">Trace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => {
                  const isExpanded = expandedRow === event.id;
                  return (
                    <Fragment key={event.id}>
                      <tr
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? null : event.id)}
                      >
                        <td className="table-cell">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                        </td>
                        <td className="table-cell whitespace-nowrap text-sm text-gray-600">
                          {formatDateTime(event.timestamp)}
                        </td>
                        <td className="table-cell">
                          <ActorDisplay actor={event.actor} actorType={event.actorType} />
                        </td>
                        <td className="table-cell">
                          <ActionBadge action={event.action} />
                        </td>
                        <td className="table-cell">
                          <Badge variant="default">{event.entityType}</Badge>
                        </td>
                        <td className="table-cell">
                          <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{event.entityId}</code>
                        </td>
                        <td className="table-cell">
                          <div className="flex flex-wrap gap-1">
                            {event.changedFields.map((field) => (
                              <span key={field} className="inline-block bg-brand-teal/10 text-brand-teal text-xs font-medium px-2 py-0.5 rounded-full">
                                {field}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="table-cell">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTraceFilter(event.traceId);
                            }}
                            className="text-xs font-medium text-brand-teal hover:underline flex items-center gap-1"
                            title={`Filter by trace: ${event.traceId}`}
                          >
                            <Link2 className="h-3 w-3" />
                            Trace
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="bg-gray-50/30 px-8 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <JsonDiff label="Before" data={event.before} changedFields={event.changedFields} />
                              <JsonDiff label="After" data={event.after} changedFields={event.changedFields} />
                            </div>
                            <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                              <span>Event ID: <code className="font-mono">{event.id}</code></span>
                              <span>Trace ID: <code className="font-mono">{event.traceId}</code></span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(pagination.page - 1) * pagination.limit + 1}
            {' '}-{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} events
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }).map((_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                    page === pageNum
                      ? 'bg-brand-blue text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= (pagination?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

