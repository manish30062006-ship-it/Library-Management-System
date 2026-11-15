import { Schema, Types, model } from 'mongoose';

export interface AuditLogDocument {
  _id: Types.ObjectId;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  createdAt: Date;
}

const auditSchema = new Schema({
  actorId: { type: String, default: null },
  actorRole: { type: String, default: null },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, default: null },
  before: { type: Schema.Types.Mixed },
  after: { type: Schema.Types.Mixed },
  ip: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

auditSchema.index({ createdAt: -1 });
auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });
auditSchema.index({ actorId: 1, createdAt: -1 });

export const AuditLog = model<AuditLogDocument>('AuditLog', auditSchema);
