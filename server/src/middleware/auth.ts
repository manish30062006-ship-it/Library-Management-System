import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';

interface AccessPayload extends jwt.JwtPayload {
  role?: Role;
  email?: string;
  memberId?: string | null;
  type?: string;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw unauthorized('Missing access token');
    }

    let payload: AccessPayload;
    try {
      payload = jwt.verify(header.slice(7).trim(), env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
      }) as AccessPayload;
    } catch {
      throw unauthorized('Invalid or expired access token');
    }

    if (!payload.sub || payload.type === 'refresh') {
      throw unauthorized('Invalid access token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { member: { select: { id: true } } },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw unauthorized('Account is not active');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      memberId: user.member?.id ?? null,
    };
    next();
  } catch (err) {
    next(err);
  }
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

export function requireMemberId(req: Parameters<RequestHandler>[0]): string {
  const memberId = req.user?.memberId;
  if (!memberId) throw forbidden('A member profile is required for this action');
  return memberId;
}
