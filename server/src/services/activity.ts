import { AuditLog, type AuditLogDocument } from '../models/auditLog';
import { prisma } from '../lib/prisma';
import { inr } from '../lib/money';
import { bookMetaMap } from './books';

export type ActivityTone = 'green' | 'amber' | 'red' | 'blue' | 'stone' | 'violet';

export interface ActivityItem {
  id: string;
  action: string;
  actor: string;
  actorRole: string | null;
  message: string;
  detail: string | null;
  tone: ActivityTone;
  createdAt: string;
}

function dateLabel(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export async function recentActivity(limit = 20): Promise<{
  items: ActivityItem[];
  generatedAt: string;
}> {
  const docs = await AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<AuditLogDocument[]>();

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
  const memberIds = new Set(entityIds('member'));

  for (const doc of docs) {
    for (const source of [asRecord(doc.after), asRecord(doc.before)]) {
      if (typeof source.memberId === 'string') memberIds.add(source.memberId);
    }
  }

  const [loans, fines, reservations, members] = await Promise.all([
    loanIds.length
      ? prisma.loan.findMany({
          where: { id: { in: loanIds } },
          include: { member: { include: { user: true } } },
        })
      : Promise.resolve([]),
    fineIds.length
      ? prisma.fine.findMany({
          where: { id: { in: fineIds } },
          include: { member: { include: { user: true } } },
        })
      : Promise.resolve([]),
    reservationIds.length
      ? prisma.reservation.findMany({
          where: { id: { in: reservationIds } },
          include: { member: { include: { user: true } } },
        })
      : Promise.resolve([]),
    memberIds.size
      ? prisma.member.findMany({
          where: { id: { in: [...memberIds] } },
          include: { user: true },
        })
      : Promise.resolve([]),
  ]);

  const loanMap = new Map(loans.map((loan) => [loan.id, loan]));
  const fineMap = new Map(fines.map((fine) => [fine.id, fine]));
  const reservationMap = new Map(reservations.map((row) => [row.id, row]));
  const memberName = new Map(members.map((member) => [member.id, member.user.name]));
  for (const loan of loans) memberName.set(loan.memberId, loan.member.user.name);
  for (const fine of fines) memberName.set(fine.memberId, fine.member.user.name);
  for (const reservation of reservations) {
    memberName.set(reservation.memberId, reservation.member.user.name);
  }

  const bookIds = new Set<string>();
  for (const loan of loans) bookIds.add(loan.bookId);
  for (const reservation of reservations) bookIds.add(reservation.bookId);
  for (const doc of docs) {
    if (doc.entityType === 'book' && doc.entityId) bookIds.add(doc.entityId);
    const after = asRecord(doc.after);
    if (typeof after.bookId === 'string') bookIds.add(after.bookId);
    const before = asRecord(doc.before);
    if (typeof before.bookId === 'string') bookIds.add(before.bookId);
  }

  const actorIds = [...new Set(docs.map((doc) => doc.actorId).filter(Boolean))] as string[];
  const [metas, actors] = await Promise.all([
    bookMetaMap([...bookIds]),
    actorIds.length
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const actorName = new Map(actors.map((user) => [user.id, user.name]));

  const bookTitle = (id?: string | null) =>
    (id ? metas.get(id)?.title : undefined) ?? 'a book';

  const items = docs.map<ActivityItem>((doc) => {
    const after = asRecord(doc.after);
    const before = asRecord(doc.before);
    const loan = doc.entityType === 'loan' && doc.entityId ? loanMap.get(doc.entityId) : null;
    const fine = doc.entityType === 'fine' && doc.entityId ? fineMap.get(doc.entityId) : null;
    const reservation =
      doc.entityType === 'reservation' && doc.entityId
        ? reservationMap.get(doc.entityId)
        : null;
    const member =
      (loan && memberName.get(loan.memberId)) ||
      (fine && memberName.get(fine.memberId)) ||
      (reservation && memberName.get(reservation.memberId)) ||
      (typeof after.memberId === 'string' ? memberName.get(after.memberId) : undefined) ||
      (doc.entityType === 'member' && doc.entityId ? memberName.get(doc.entityId) : undefined) ||
      'a member';

    const base = {
      id: String(doc._id),
      action: doc.action,
      actor: (doc.actorId && actorName.get(doc.actorId)) || 'System',
      actorRole: doc.actorRole,
      createdAt: new Date(doc.createdAt).toISOString(),
    };

    switch (doc.action) {
      case 'loan.checkout': {
        const title = bookTitle(loan?.bookId ?? (after.bookId as string | undefined));
        return {
          ...base,
          tone: 'amber',
          message: `Issued “${title}” to ${member}`,
          detail: loan ? `Due ${dateLabel(loan.dueAt)}` : null,
        };
      }
      case 'loan.return': {
        const title = bookTitle(loan?.bookId);
        const cents = Number(after.fineCents ?? 0);
        return {
          ...base,
          tone: 'green',
          message: `Returned “${title}” — ${member}`,
          detail: cents > 0 ? `Fine ${inr(cents)}` : 'Returned on time',
        };
      }
      case 'loan.renew': {
        const title = bookTitle(loan?.bookId);
        return {
          ...base,
          tone: 'blue',
          message: `Renewed “${title}” for ${member}`,
          detail: loan ? `New due ${dateLabel(loan.dueAt)}` : null,
        };
      }
      case 'loan.lost': {
        const title = bookTitle(loan?.bookId);
        const cents = Number(after.feeCents ?? 0);
        return {
          ...base,
          tone: 'red',
          message: `Marked “${title}” lost — ${member}`,
          detail: cents > 0 ? `Replacement fee ${inr(cents)}` : null,
        };
      }
      case 'fine.payment': {
        const cents = Number(after.amountCents ?? 0);
        return {
          ...base,
          tone: 'green',
          message: `Fine payment ${inr(cents)} — ${member}`,
          detail: after.method ? String(after.method) : null,
        };
      }
      case 'fine.waive':
        return {
          ...base,
          tone: 'stone',
          message: `Fine waived ${inr(Number(before.amount ?? 0))} — ${member}`,
          detail: after.note ? String(after.note) : null,
        };
      case 'member.create':
        return {
          ...base,
          tone: 'violet',
          message: `Member added — ${String(asRecord(after.user).name ?? 'new member')}`,
          detail: [after.membershipNo, asRecord(after.user).email]
            .filter(Boolean)
            .join(' · ') || null,
        };
      case 'auth.register':
        return {
          ...base,
          tone: 'violet',
          message: `New sign-up — ${base.actor}`,
          detail: 'Member account created',
        };
      case 'member.update':
        return {
          ...base,
          tone: 'stone',
          message: `Member updated — ${member}`,
          detail:
            after.status && after.status !== before.status
              ? `Status ${String(before.status ?? '—')} → ${String(after.status)}`
              : null,
        };
      case 'reservation.create': {
        const title = bookTitle(
          reservation?.bookId ?? (after.bookId as string | undefined),
        );
        return {
          ...base,
          tone: 'violet',
          message: `Hold placed — “${title}” for ${member}`,
          detail: after.status === 'READY' ? 'Copy ready for pickup' : 'In the queue',
        };
      }
      case 'reservation.cancel': {
        const title = bookTitle(
          reservation?.bookId ?? (before.bookId as string | undefined),
        );
        return {
          ...base,
          tone: 'stone',
          message: `Hold cancelled — “${title}”`,
          detail: member === 'a member' ? null : member,
        };
      }
      case 'book.create':
        return {
          ...base,
          tone: 'blue',
          message: `Book added — “${bookTitle(doc.entityId)}”`,
          detail: after.isbn ? `ISBN ${String(after.isbn)}` : null,
        };
      case 'book.update':
        return {
          ...base,
          tone: 'stone',
          message: `Book updated — “${bookTitle(doc.entityId)}”`,
          detail: null,
        };
      case 'book.archive':
        return {
          ...base,
          tone: 'red',
          message: `Book archived — “${bookTitle(doc.entityId)}”`,
          detail: null,
        };
      case 'copy.create':
        return {
          ...base,
          tone: 'blue',
          message: `Copies added — “${bookTitle(doc.entityId)}”`,
          detail: [after.count ? `${String(after.count)} copies` : null, after.location]
            .filter(Boolean)
            .join(' · ') || null,
        };
      default:
        return {
          ...base,
          tone: 'stone',
          message: doc.action.replace(/[._]/g, ' '),
          detail: doc.entityType,
        };
    }
  });

  return { items, generatedAt: new Date().toISOString() };
}
