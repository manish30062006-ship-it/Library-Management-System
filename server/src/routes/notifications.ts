import { Router } from 'express';
import { asyncHandler, getPage } from '../lib/http';
import { requireAuth } from '../middleware/auth';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notifications';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const { page, pageSize } = getPage(req.query, 20, 50);
    res.json(
      await listNotifications(req.user!.id, {
        unread: String(req.query.unread) === 'true',
        page,
        pageSize,
      }),
    );
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const updated = await markAllNotificationsRead(req.user!.id);
    res.json({ updated });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await markNotificationRead(req.user!.id, req.params.id);
    res.status(204).end();
  }),
);
