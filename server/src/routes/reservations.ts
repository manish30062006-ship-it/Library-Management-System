import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parseBody, parseUuid } from '../lib/http';
import { badRequest, notFound } from '../lib/errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import {
  cancelReservation,
  createReservation,
  listQueue,
} from '../services/reservations';
import { resolveMember } from '../services/members';

export const reservationsRouter = Router();

const staff = requireRole('ADMIN', 'LIBRARIAN');
const writeLimiter = rateLimit({ bucket: 'reservations-write', limit: 60, windowSec: 60 });

reservationsRouter.post(
  '/',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const data = parseBody(
      z.object({
        memberId: z.string().uuid().optional(),
        memberQuery: z.string().trim().min(2).max(200).optional(),
        bookId: z.string().min(1).max(64),
      }),
      req.body,
    );

    let memberId = data.memberId;
    if (!memberId && data.memberQuery) {
      const member = await resolveMember(data.memberQuery);
      if (!member) throw notFound('Member not found');
      memberId = member.id;
    }
    if (!memberId) throw badRequest('Provide memberId or memberQuery');

    const reservation = await createReservation(memberId, data.bookId, req.user!, req.ip);
    res.status(201).json(reservation);
  }),
);

reservationsRouter.get(
  '/',
  requireAuth,
  staff,
  asyncHandler(async (req, res) => {
    const bookId = String(req.query.bookId ?? '');
    if (!bookId) throw badRequest('bookId is required');
    res.json({ items: await listQueue(bookId) });
  }),
);

reservationsRouter.post(
  '/:id/cancel',
  requireAuth,
  staff,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const id = parseUuid(req.params.id);
    res.json(await cancelReservation(id, req.user!, req.ip));
  }),
);
