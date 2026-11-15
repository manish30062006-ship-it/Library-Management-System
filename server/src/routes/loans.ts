import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, getPage, parseBody, parseQuery, parseUuid } from '../lib/http';
import { badRequest, notFound } from '../lib/errors';
import { requireAuth, requireMemberId, requireRole } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import {
  checkout,
  listLoansForMember,
  listLoansForStaff,
  markLoanLost,
  renewLoan,
  returnLoan,
} from '../services/circulation';
import { resolveMember } from '../services/members';

export const loansRouter = Router();

const staff = requireRole('ADMIN', 'LIBRARIAN');
const writeLimiter = rateLimit({ bucket: 'loans-write', limit: 120, windowSec: 60 });

const checkoutSchema = z.object({
  memberId: z.string().uuid().optional(),
  memberQuery: z.string().trim().min(2).max(200).optional(),
  copyId: z.string().uuid().optional(),
  copyCode: z.string().trim().min(1).max(50).optional(),
  bookId: z.string().trim().min(1).max(64).optional(),
  dueInDays: z.coerce.number().int().min(1).max(60).optional(),
});

const returnSchema = z.object({
  loanId: z.string().uuid().optional(),
  copyCode: z.string().trim().min(1).max(50).optional(),
});

const lostSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

loansRouter.post(
  '/checkout',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const data = parseBody(checkoutSchema, req.body);
    const copySelectors = [data.copyId, data.copyCode, data.bookId].filter(Boolean);
    if (copySelectors.length !== 1) {
      throw badRequest('Provide exactly one of copyId, copyCode, or bookId');
    }

    let memberId = data.memberId;
    if (!memberId && data.memberQuery) {
      const member = await resolveMember(data.memberQuery);
      if (!member) throw notFound('Member not found');
      memberId = member.id;
    }
    if (!memberId) throw badRequest('Provide memberId or memberQuery');

    const loan = await checkout({ ...data, memberId }, req.user!, req.ip);
    res.status(201).json(loan);
  }),
);

loansRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const memberId = requireMemberId(req);
    const status = (req.query.status as 'active' | 'returned' | 'all') ?? 'all';
    if (!['active', 'returned', 'all'].includes(status)) {
      throw badRequest('Invalid status filter');
    }
    const items = await listLoansForMember(memberId, status);
    res.json({ items });
  }),
);

loansRouter.post(
  '/return',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const data = parseBody(returnSchema, req.body);
    const selectors = [data.loanId, data.copyCode].filter(Boolean);
    if (selectors.length !== 1) {
      throw badRequest('Provide exactly one of loanId or copyCode');
    }
    res.json(await returnLoan(data, req.user!, req.ip));
  }),
);

loansRouter.post(
  '/:id/return',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const loanId = parseUuid(req.params.id);
    res.json(await returnLoan({ loanId }, req.user!, req.ip));
  }),
);

loansRouter.post(
  '/:id/renew',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const loanId = parseUuid(req.params.id);
    res.json(await renewLoan(loanId, req.user!, req.ip));
  }),
);

loansRouter.post(
  '/:id/lost',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const loanId = parseUuid(req.params.id);
    const data = parseBody(lostSchema, req.body);
    res.json(await markLoanLost(loanId, req.user!, data.note, req.ip));
  }),
);

const listSchema = z.object({
  status: z.enum(['active', 'overdue', 'returned', 'lost', 'all']).default('all'),
  memberId: z.string().uuid().optional(),
  bookId: z.string().trim().min(1).max(64).optional(),
});

loansRouter.get(
  '/',
  requireAuth,
  staff,
  asyncHandler(async (req, res) => {
    const query = parseQuery(listSchema, req.query);
    const { page, pageSize } = getPage(req.query, 25, 100);
    res.json(
      await listLoansForStaff({
        status: query.status,
        memberId: query.memberId,
        bookId: query.bookId,
        page,
        pageSize,
      }),
    );
  }),
);
