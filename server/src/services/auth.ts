import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { env, isProd } from '../config/env';
import { prisma } from '../lib/prisma';
import { unauthorized } from '../lib/errors';

const COOKIE_NAME = 'athenaeum_rt';
const COOKIE_PATH = '/api/auth';

export type UserWithMember = User & { member?: { id: string } | null };

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshMaxAgeMs: number;
}

function accessTokenFor(user: UserWithMember, memberId: string | null): string {
  return jwt.sign(
    { role: user.role, email: user.email, memberId },
    env.JWT_ACCESS_SECRET,
    { subject: user.id, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, algorithm: 'HS256' },
  );
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionTtlMs(): number {
  return env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
}

function mintTokens(user: UserWithMember) {
  const sessionId = crypto.randomUUID();
  const ttlMs = sessionTtlMs();
  const refreshToken = jwt.sign({ type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    subject: user.id,
    jwtid: sessionId,
    expiresIn: Math.floor(ttlMs / 1000),
    algorithm: 'HS256',
  });

  return {
    sessionId,
    refreshToken,
    refreshHash: tokenHash(refreshToken),
    accessToken: accessTokenFor(user, user.member?.id ?? null),
    ttlMs,
  };
}

function sessionData(
  userId: string,
  minted: ReturnType<typeof mintTokens>,
  req: Request,
) {
  return {
    id: minted.sessionId,
    userId,
    tokenHash: minted.refreshHash,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
    expiresAt: new Date(Date.now() + minted.ttlMs),
  };
}

export async function issueSession(user: UserWithMember, req: Request): Promise<IssuedSession> {
  const minted = mintTokens(user);
  await prisma.authSession.create({ data: sessionData(user.id, minted, req) });

  return {
    accessToken: minted.accessToken,
    refreshToken: minted.refreshToken,
    refreshMaxAgeMs: minted.ttlMs,
  };
}

export function setRefreshCookie(res: Response, token: string, maxAgeMs: number): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: COOKIE_PATH,
    maxAge: maxAgeMs,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: COOKIE_PATH,
  });
}

export function getRefreshCookie(req: Request): string | null {
  const value = req.cookies?.[COOKIE_NAME];
  return typeof value === 'string' ? value : null;
}

export async function rotateSession(token: string, req: Request): Promise<IssuedSession> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
  } catch {
    throw unauthorized('Invalid refresh token');
  }

  if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
    throw unauthorized('Invalid refresh token');
  }

  const existing = await prisma.authSession.findUnique({ where: { id: payload.jti } });
  const valid =
    existing &&
    existing.userId === payload.sub &&
    existing.expiresAt.getTime() > Date.now() &&
    existing.tokenHash === tokenHash(token);
  if (!existing || !valid) {
    if (existing) {
      await prisma.authSession.delete({ where: { id: existing.id } }).catch(() => undefined);
    }
    throw unauthorized('Session expired or revoked');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { member: { select: { id: true } } },
  });
  if (!user || user.status !== 'ACTIVE') {
    await prisma.authSession.delete({ where: { id: existing.id } }).catch(() => undefined);
    throw unauthorized('Account is not active');
  }

  const minted = mintTokens(user);
  await prisma.$transaction([
    prisma.authSession.delete({ where: { id: existing.id } }),
    prisma.authSession.create({ data: sessionData(user.id, minted, req) }),
  ]);

  return {
    accessToken: minted.accessToken,
    refreshToken: minted.refreshToken,
    refreshMaxAgeMs: minted.ttlMs,
  };
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token) return;
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    if (payload.jti) {
      await prisma.authSession.delete({ where: { id: payload.jti } }).catch(() => undefined);
    }
  } catch {
    // Invalid/expired refresh cookies are harmless to revoke.
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
