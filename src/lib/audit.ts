import { prisma } from './prisma';

interface AuditContext {
  actorId: string;
  actorType: 'USER' | 'SYSTEM' | 'WEBHOOK' | 'ETL' | 'CRON';
  actorIp?: string;
  traceId?: string;
  reason?: string;
}

/** Create an immutable audit event */
export async function createAuditEvent(
  context: AuditContext,
  action: string,
  entityType: string,
  entityId: string,
  previousState: Record<string, unknown> | null,
  newState: Record<string, unknown> | null,
  parentEventId?: string,
) {
  const changedFields = previousState && newState
    ? Object.keys(newState).filter(key =>
        JSON.stringify(previousState[key]) !== JSON.stringify(newState[key])
      )
    : [];

  return prisma.auditEvent.create({
    data: {
      actorId: context.actorId,
      actorType: context.actorType,
      actorIp: context.actorIp,
      action,
      entityType,
      entityId,
      previousState: previousState || undefined,
      newState: newState || undefined,
      changedFields,
      reason: context.reason,
      traceId: context.traceId,
      parentEventId,
    },
  });
}
