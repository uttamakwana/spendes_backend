import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../../database/base.repository';

/**
 * An immutable record of one admin action (who did what to which record, and
 * when). Every mutating `/admin` route writes one; the audit trail is read-only
 * from the panel. `before`/`after` hold only the fields that changed.
 */
export interface AuditLogDocument extends BaseDocument {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  actorName: string;
  /** Dotted verb, e.g. `user.update`, `group.archive`, `broadcast.send`. */
  action: string;
  targetType: string;
  targetId?: string;
  /** Human-readable one-liner, e.g. "Deactivated Asha Patel (+919876543210)". */
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    targetType: { type: String, required: true, trim: true },
    targetId: { type: String, trim: true },
    summary: { type: String, required: true, trim: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    requestId: { type: String, trim: true },
  },
  { timestamps: true, collection: 'admin_audit_logs' },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLogModel = model<AuditLogDocument>('AuditLog', auditLogSchema);
