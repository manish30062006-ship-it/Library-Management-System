import { AuditLog } from '../models/auditLog';
import { logger } from '../lib/logger';
import type { AuthUser } from '../types/auth';

export interface AuditEntry {
  actor?: AuthUser | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      actorId: entry.actor?.id ?? null,
      actorRole: entry.actor?.role ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
    });
  } catch (err) {
    logger.warn('Audit write failed', {
      action: entry.action,
      entityType: entry.entityType,
      error: (err as Error).message,
    });
  }
}

export async function listAudit(page: number, pageSize: number) {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    AuditLog.countDocuments(),
  ]);
  return { items, total, page, pageSize };
}
