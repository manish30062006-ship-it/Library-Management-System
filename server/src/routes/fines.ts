import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, getPage, parseBody, parseQuery, parseUuid } from '../lib/http';
import { requireAuth, requireMemberId, requireRole } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import {
  listFinesForMember,
  listFinesForStaff,
  payFine,
  waiveFine,
} from '../services/fines';

export const finesRouter = Router();

const staff = requireRole('ADMIN', 'LIBRARIAN');
const writeLimiter = rateLimit({ bucket: 'fines-write', limit: 120, windowSec: 60 });

const paymentSchema = z.object({
  amount: z.coerce.number().int().positive().max(10_000_000),
  method: z.enum(['CASH', 'CARD', 'ONLINE']),
  reference: z.string().trim().max(120).optional(),
});

const waiveSchema = z.object({
  note: z.string().trim().min(3).max(500),
});

finesRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const memberId = requireMemberId(req);
    const fines = await listFinesForMember(memberId);
    res.json({
      items: fines.map((fine) => ({
        ...fine,
        remainingCents: Math.max(0, fine.amount - fine.paidAmount),
      })),
    });
  }),
);

const listSchema = z.object({
  status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'WAIVED']).optional(),
  memberId: z.string().uuid().optional(),
});

finesRouter.get(
  '/',
  requireAuth,
  staff,
  asyncHandler(async (req, res) => {
    const query = parseQuery(listSchema, req.query);
    const { page, pageSize } = getPage(req.query, 25, 100);
    res.json(
      await listFinesForStaff({
        status: query.status,
        memberId: query.memberId,
        page,
        pageSize,
      }),
    );
  }),
);

finesRouter.post(
  '/:id/payments',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const fineId = parseUuid(req.params.id);
    const data = parseBody(paymentSchema, req.body);
    const fine = await payFine({
      fineId,
      amount: data.amount,
      method: data.method,
      reference: data.reference,
      actor: req.user!,
      ip: req.ip,
    });
    res.status(201).json(fine);
  }),
);

finesRouter.post(
  '/:id/waive',
  requireAuth,
  requireRole('ADMIN'),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const fineId = parseUuid(req.params.id);
    const data = parseBody(waiveSchema, req.body);
    const fine = await waiveFine({
      fineId,
      note: data.note,
      actor: req.user!,
      ip: req.ip,
    });
    res.json(fine);
  }),
);
