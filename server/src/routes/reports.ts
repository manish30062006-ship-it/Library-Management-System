import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, getPage, parseQuery } from '../lib/http';
import { requireAuth, requireRole } from '../middleware/auth';
import { dashboard } from '../services/reports';
import { listAudit } from '../services/audit';
import { recentActivity } from '../services/activity';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole('ADMIN', 'LIBRARIAN'));

const dashboardSchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});

reportsRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const query = parseQuery(dashboardSchema, req.query);
    res.json(await dashboard(query.days));
  }),
);

reportsRouter.get(
  '/activity',
  asyncHandler(async (_req, res) => {
    res.json(await recentActivity(20));
  }),
);

reportsRouter.get(
  '/audit',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = getPage(req.query, 50, 100);
    res.json(await listAudit(page, pageSize));
  }),
);
