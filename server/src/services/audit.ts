import { AuditLog } from '../models/auditLog';
import { prisma } from '../lib/prisma';
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
  const [docs, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    AuditLog.countDocuments(),
  ]);

  const actorIds = [
    ...new Set(docs.map((doc) => doc.actorId).filter((id): id is string => Boolean(id))),
  ];
  const entityIds = (type: string) => [
    ...new Set(
      docs
        .filter((doc) => doc.entityType === type && doc.entityId)
        .map((doc) => doc.entityId as string),
    ),
  ];

  const loanIds = entityIds('loan');
  const fineIds = entityIds('fine');
  const reservationIds = entityIds('reservation');

  const [actors, loans, fines, reservations] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    loanIds.length
      ? prisma.loan.findMany({
          where: { id: { in: loanIds } },
          select: { id: true, memberId: true },
        })
      : Promise.resolve([]),
    fineIds.length
      ? prisma.fine.findMany({
          where: { id: { in: fineIds } },
          select: { id: true, memberId: true },
        })
      : Promise.resolve([]),
    reservationIds.length
      ? prisma.reservation.findMany({
          where: { id: { in: reservationIds } },
          select: { id: true, memberId: true },
        })
      : Promise.resolve([]),
  ]);

  // Which member does each audited entity belong to?
  const memberByEntity = new Map<string, string>();
  for (const loan of loans) memberByEntity.set(`loan:${loan.id}`, loan.memberId);
  for (const fine of fines) memberByEntity.set(`fine:${fine.id}`, fine.memberId);
  for (const reservation of reservations) {
    memberByEntity.set(`reservation:${reservation.id}`, reservation.memberId);
  }

  const memberIds = new Set<string>(entityIds('member'));
  for (const memberId of memberByEntity.values()) memberIds.add(memberId);
  for (const doc of docs) {
    for (const snapshot of [doc.after, doc.before]) {
      if (
        snapshot &&
        typeof snapshot === 'object' &&
        typeof (snapshot as Record<string, unknown>).memberId === 'string'
      ) {
        memberIds.add((snapshot as Record<string, unknown>).memberId as string);
      }
    }
  }

  const members = memberIds.size
    ? await prisma.member.findMany({
        where: { id: { in: [...memberIds] } },
        select: {
          id: true,
          membershipNo: true,
          user: { select: { name: true } },
        },
      })
    : [];
  const membersById = new Map(members.map((member) => [member.id, member]));

  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));

  const memberFor = (doc: (typeof docs)[number]) => {
    const entityKey =
      doc.entityType && doc.entityId ? `${doc.entityType}:${doc.entityId}` : null;
    const memberId =
      (entityKey ? memberByEntity.get(entityKey) : undefined) ??
      (doc.entityType === 'member' && doc.entityId ? doc.entityId : undefined) ??
      (doc.after && typeof doc.after === 'object'
        ? ((doc.after as Record<string, unknown>).memberId as string | undefined)
        : undefined) ??
      (doc.before && typeof doc.before === 'object'
        ? ((doc.before as Record<string, unknown>).memberId as string | undefined)
        : undefined);
    return memberId ? membersById.get(memberId) ?? null : null;
  };

  const items = docs.map((doc) => {
    const member = memberFor(doc);
    return {
      ...doc,
      actorName: doc.actorId ? (actorNames.get(doc.actorId) ?? null) : null,
      memberName: member?.user.name ?? null,
      membershipNo: member?.membershipNo ?? null,
    };
  });

  return { items, total, page, pageSize };
}
