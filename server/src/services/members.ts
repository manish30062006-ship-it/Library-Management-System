import type { Member, Prisma, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { addDays } from '../lib/time';
import { badRequest, conflict, notFound } from '../lib/errors';
import { hashPassword } from './auth';
import { decorateLoans } from './loans';
import { listMyReservations } from './reservations';
import { unreadNotificationCount } from './notifications';
import { writeAudit } from './audit';
import type { AuthUser } from '../types/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MemberWithUser = Member & { user: User };

function publicMember(member: MemberWithUser) {
  return {
    id: member.id,
    membershipNo: member.membershipNo,
    phone: member.phone,
    address: member.address,
    status: member.status,
    maxLoans: member.maxLoans,
    expiresAt: member.expiresAt,
    joinedAt: member.joinedAt,
    user: {
      id: member.user.id,
      email: member.user.email,
      name: member.user.name,
      role: member.user.role,
      status: member.user.status,
    },
  };
}

export async function resolveMember(query: string) {
  const q = query.trim();
  if (!q) throw badRequest('Search value is required');

  if (UUID_RE.test(q)) {
    const byId = await prisma.member.findUnique({
      where: { id: q },
      include: { user: true },
    });
    if (byId) return byId;
  }

  return prisma.member.findFirst({
    where: {
      OR: [
        { membershipNo: { equals: q } },
        { user: { email: { equals: q.toLowerCase() } } },
        { user: { name: { contains: q } } },
      ],
    },
    include: { user: true },
    orderBy: { joinedAt: 'asc' },
  });
}

async function buildMemberDesk(member: MemberWithUser) {
  const [loans, fines, reservations] = await Promise.all([
    prisma.loan.findMany({
      where: { memberId: member.id },
      orderBy: { checkedOutAt: 'desc' },
      take: 100,
      include: {
        copy: { select: { copyCode: true } },
        issuedBy: { select: { name: true } },
      },
    }),
    prisma.fine.findMany({
      where: { memberId: member.id },
      orderBy: { assessedAt: 'desc' },
      include: {
        payments: { include: { receivedBy: { select: { name: true } } } },
      },
    }),
    listMyReservations(member.id),
  ]);

  const decorated = await decorateLoans(loans);
  const outstandingFineCents = fines
    .filter((fine) => fine.status === 'PENDING' || fine.status === 'PARTIAL')
    .reduce((sum, fine) => sum + (fine.amount - fine.paidAmount), 0);

  return {
    member: publicMember(member),
    activeLoans: decorated.filter((loan) => loan.status === 'ACTIVE'),
    history: decorated.filter((loan) => loan.status !== 'ACTIVE'),
    reservations,
    fines: fines.map((fine) => ({
      ...fine,
      remainingCents: Math.max(0, fine.amount - fine.paidAmount),
    })),
    outstandingFineCents,
  };
}

export async function getMeSummary(userId: string) {
  const member = await prisma.member.findUnique({
    where: { userId },
    include: { user: true },
  });
  if (!member) throw notFound('Member profile not found');

  const [desk, unreadNotifications] = await Promise.all([
    buildMemberDesk(member),
    unreadNotificationCount(userId),
  ]);

  return { ...desk, unreadNotifications };
}

export async function getMemberDetail(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { user: true },
  });
  if (!member) throw notFound('Member not found');
  return buildMemberDesk(member);
}

export async function searchMembers(q: string | undefined, page: number, pageSize: number) {
  const where: Prisma.MemberWhereInput = q
    ? {
        OR: [
          { membershipNo: { contains: q } },
          { user: { email: { contains: q } } },
          { user: { name: { contains: q } } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.member.findMany({
      where,
      include: {
        user: true,
        _count: {
          select: {
            loans: { where: { status: 'ACTIVE' } },
            fines: { where: { status: { in: ['PENDING', 'PARTIAL'] } } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.member.count({ where }),
  ]);

  return {
    items: items.map((member) => ({
      ...publicMember(member),
      activeLoanCount: member._count.loans,
      openFineCount: member._count.fines,
    })),
    total,
    page,
    pageSize,
  };
}

export interface CreateMemberInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  membershipNo?: string;
}

export async function createMember(
  input: CreateMemberInput,
  actor: AuthUser,
  ip?: string | null,
) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict('Email is already registered');

  const membershipNo =
    input.membershipNo?.trim() ||
    `M-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;

  const member = await prisma.member.create({
    data: {
      membershipNo,
      phone: input.phone,
      expiresAt: addDays(new Date(), 365),
      user: {
        create: {
          email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
          role: 'MEMBER',
        },
      },
    },
    include: { user: true },
  });

  await writeAudit({
    actor,
    action: 'member.create',
    entityType: 'member',
    entityId: member.id,
    after: publicMember(member),
    ip,
  });

  return publicMember(member);
}

export interface UpdateMemberInput {
  status?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  maxLoans?: number;
  expiresAt?: string;
}

export async function updateMember(
  memberId: string,
  input: UpdateMemberInput,
  actor: AuthUser,
  ip?: string | null,
) {
  const existing = await prisma.member.findUnique({
    where: { id: memberId },
    include: { user: true },
  });
  if (!existing) throw notFound('Member not found');

  const member = await prisma.member.update({
    where: { id: memberId },
    data: {
      status: input.status,
      maxLoans: input.maxLoans,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    },
    include: { user: true },
  });

  await writeAudit({
    actor,
    action: 'member.update',
    entityType: 'member',
    entityId: memberId,
    before: {
      status: existing.status,
      maxLoans: existing.maxLoans,
      expiresAt: existing.expiresAt,
    },
    after: {
      status: member.status,
      maxLoans: member.maxLoans,
      expiresAt: member.expiresAt,
    },
    ip,
  });

  return publicMember(member);
}
