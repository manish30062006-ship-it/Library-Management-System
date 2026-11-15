import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, getPage, parseBody, parseQuery, parseUuid } from '../lib/http';
import { notFound } from '../lib/errors';
import { requireAuth, requireMemberId, requireRole } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import {
  createMember,
  getMeSummary,
  getMemberDetail,
  resolveMember,
  searchMembers,
  updateMember,
} from '../services/members';

export const membersRouter = Router();
export const meRouter = Router();

const staff = requireRole('ADMIN', 'LIBRARIAN');
const writeLimiter = rateLimit({ bucket: 'members-write', limit: 60, windowSec: 60 });

const createSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(72),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).optional(),
  membershipNo: z.string().trim().min(3).max(30).optional(),
});

const updateSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'EXPIRED']).optional(),
  maxLoans: z.coerce.number().int().min(1).max(20).optional(),
  expiresAt: z.coerce.date().optional().transform((value) => value?.toISOString()),
});

const listSchema = z.object({
  q: z.string().trim().max(200).optional(),
});

meRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireMemberId(req);
    res.json(await getMeSummary(req.user!.id));
  }),
);

membersRouter.get(
  '/lookup',
  requireAuth,
  staff,
  asyncHandler(async (req, res) => {
    const query = parseQuery(z.object({ q: z.string().trim().min(2).max(200) }), req.query);
    const member = await resolveMember(query.q);
    if (!member) throw notFound('No member matches that search');
    res.json(await getMemberDetail(member.id));
  }),
);

membersRouter.get(
  '/',
  requireAuth,
  staff,
  asyncHandler(async (req, res) => {
    const query = parseQuery(listSchema, req.query);
    const { page, pageSize } = getPage(req.query, 20, 100);
    res.json(await searchMembers(query.q, page, pageSize));
  }),
);

membersRouter.post(
  '/',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const data = parseBody(createSchema, req.body);
    const member = await createMember(data, req.user!, req.ip);
    res.status(201).json(member);
  }),
);

membersRouter.get(
  '/:id',
  requireAuth,
  staff,
  asyncHandler(async (req, res) => {
    const id = parseUuid(req.params.id);
    res.json(await getMemberDetail(id));
  }),
);

membersRouter.patch(
  '/:id',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const id = parseUuid(req.params.id);
    const data = parseBody(updateSchema, req.body);
    res.json(await updateMember(id, data, req.user!, req.ip));
  }),
);
