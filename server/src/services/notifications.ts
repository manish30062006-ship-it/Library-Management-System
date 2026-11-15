import mongoose, { type FilterQuery } from 'mongoose';
import { Notification, type NotificationDocument, type NotificationType } from '../models/notification';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { notFound } from '../lib/errors';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
}

export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    await Notification.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? null,
      dedupeKey: input.dedupeKey ?? null,
    });
    logger.debug('Notification created', { userId: input.userId, type: input.type });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return;
    logger.warn('Notification write failed', {
      userId: input.userId,
      type: input.type,
      error: (err as Error).message,
    });
  }
}

export async function notifyMember(
  memberId: string,
  input: Omit<NotifyInput, 'userId'>,
): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { userId: true },
  });
  if (!member) return;
  await notifyUser({ userId: member.userId, ...input });
}

export async function listNotifications(
  userId: string,
  options: { unread: boolean; page: number; pageSize: number },
) {
  const where: FilterQuery<NotificationDocument> = { userId };
  if (options.unread) where.readAt = null;

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(where)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.pageSize)
      .limit(options.pageSize)
      .lean(),
    Notification.countDocuments(where),
    Notification.countDocuments({ userId, readAt: null }),
  ]);

  return {
    items: items.map((n) => ({
      id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data ?? null,
      readAt: n.readAt ?? null,
      createdAt: n.createdAt,
    })),
    total,
    unreadCount,
    page: options.page,
    pageSize: options.pageSize,
  };
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw notFound('Notification not found');
  const result = await Notification.updateOne(
    { _id: id, userId },
    { $set: { readAt: new Date() } },
  );
  if (result.matchedCount === 0) throw notFound('Notification not found');
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount;
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, readAt: null });
}
