import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type Member, type User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, parseBody } from '../lib/http';
import { conflict, unauthorized } from '../lib/errors';
import { addDays } from '../lib/time';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import {
  clearRefreshCookie,
  getRefreshCookie,
  hashPassword,
  issueSession,
  revokeSession,
  rotateSession,
  setRefreshCookie,
  verifyPassword,
} from '../services/auth';
import { writeAudit } from '../services/audit';

export const authRouter = Router();

const authLimiter = rateLimit({ bucket: 'auth', limit: 30, windowSec: 15 * 60 });

const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(72),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(72),
});

type UserWithProfile = User & { member: Member | null };

function randomMembershipNo(): string {
  return `M-${Math.floor(100000 + Math.random() * 900000)}`;
}

function isUniqueViolation(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  const target = err.meta?.target;
  return Array.isArray(target) && target.includes(field);
}

function userPayload(user: UserWithProfile) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    member: user.member
      ? {
          id: user.member.id,
          membershipNo: user.member.membershipNo,
          status: user.member.status,
          maxLoans: user.member.maxLoans,
          expiresAt: user.member.expiresAt,
        }
      : null,
  };
}

authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = parseBody(registerSchema, req.body);
    const email = data.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict('Email is already registered');

    const passwordHash = await hashPassword(data.password);
    let user: UserWithProfile | null = null;
    for (let attempt = 0; attempt < 5 && !user; attempt += 1) {
      try {
        user = await prisma.user.create({
          data: {
            email,
            name: data.name,
            passwordHash,
            role: 'MEMBER',
            member: {
              create: {
                membershipNo: randomMembershipNo(),
                phone: data.phone,
                expiresAt: addDays(new Date(), 365),
              },
            },
          },
          include: { member: true },
        });
      } catch (err) {
        if (isUniqueViolation(err, 'membershipNo')) continue;
        if (isUniqueViolation(err, 'email')) throw conflict('Email is already registered');
        throw err;
      }
    }
    if (!user) throw conflict('Could not allocate a membership ID, please retry');

    const session = await issueSession(user, req);
    setRefreshCookie(res, session.refreshToken, session.refreshMaxAgeMs);

    await writeAudit({
      actor: { id: user.id, email: user.email, role: user.role, memberId: user.member?.id ?? null },
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
      ip: req.ip,
    });

    res.status(201).json({
      accessToken: session.accessToken,
      user: userPayload(user),
    });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = parseBody(loginSchema, req.body);
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
      include: { member: true },
    });

    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      throw unauthorized('Invalid email or password');
    }
    if (user.status !== 'ACTIVE') throw unauthorized('Account is not active');

    const session = await issueSession(user, req);
    setRefreshCookie(res, session.refreshToken, session.refreshMaxAgeMs);

    res.json({ accessToken: session.accessToken, user: userPayload(user) });
  }),
);

authRouter.post(
  '/refresh',
  authLimiter,
  asyncHandler(async (req, res) => {
    const token = getRefreshCookie(req);
    if (!token) throw unauthorized('No refresh session');
    const session = await rotateSession(token, req);
    setRefreshCookie(res, session.refreshToken, session.refreshMaxAgeMs);
    res.json({ accessToken: session.accessToken });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeSession(getRefreshCookie(req));
    clearRefreshCookie(res);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { member: true },
    });
    if (!user) throw unauthorized();
    res.json({ user: userPayload(user) });
  }),
);
