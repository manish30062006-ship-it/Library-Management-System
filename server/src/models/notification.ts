import { Schema, Types, model } from 'mongoose';

export type NotificationType =
  | 'HOLD_READY'
  | 'DUE_SOON'
  | 'OVERDUE'
  | 'FINE'
  | 'PAYMENT'
  | 'SYSTEM';

export interface NotificationDocument {
  _id: Types.ObjectId;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  readAt?: Date | null;
  createdAt: Date;
}

const notificationSchema = new Schema({
  userId: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ['HOLD_READY', 'DUE_SOON', 'OVERDUE', 'FINE', 'PAYMENT', 'SYSTEM'],
  },
  title: { type: String, required: true },
  body: { type: String, required: true },
  data: { type: Schema.Types.Mixed, default: null },
  dedupeKey: { type: String, default: null },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);

export const Notification = model<NotificationDocument>('Notification', notificationSchema);
