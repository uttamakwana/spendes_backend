import type { Request } from 'express';
import type { FilterQuery } from 'mongoose';
import { createLogger } from '../../../logger';
import type { PaginatedData } from '../../../common/types/api-response';
import { paginate } from '../../../common/utils/response';
import { UserModel } from '../../../database/models.registry';
import { dateRange, escapeRegex } from '../admin.helpers';
import type { ListAuditQuery } from '../admin.validation';
import { AuditLogModel, type AuditLogDocument } from './audit-log.model';

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface AuditLogResponse {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  createdAt: Date;
}

function toResponse(d: AuditLogDocument): AuditLogResponse {
  return {
    id: d._id.toString(),
    actorId: d.actorId.toString(),
    actorName: d.actorName,
    action: d.action,
    targetType: d.targetType,
    targetId: d.targetId,
    summary: d.summary,
    before: d.before,
    after: d.after,
    meta: d.meta,
    ip: d.ip,
    userAgent: d.userAgent,
    requestId: d.requestId,
    createdAt: d.createdAt,
  };
}

/** Keeps only the keys whose values differ — so an audit row shows exactly what changed. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

/**
 * The admin audit trail. `record` is awaited by callers (an admin action without
 * an audit row is a compliance gap) but never throws — a failed write is logged.
 */
class AuditService {
  private readonly logger = createLogger('AuditService');
  private readonly nameCache = new Map<string, string>();

  async record(req: Request, entry: AuditEntry): Promise<void> {
    try {
      const actorId = req.user!.id;
      await AuditLogModel.create({
        ...entry,
        actorId,
        actorName: await this.actorName(actorId),
        ip: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 300),
        requestId: req.requestId,
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log (${entry.action}): ${(error as Error).message}`);
    }
  }

  async list(query: ListAuditQuery): Promise<PaginatedData<AuditLogResponse>> {
    const filter: FilterQuery<AuditLogDocument> = {};
    if (query.actorId) filter.actorId = query.actorId;
    if (query.targetType) filter.targetType = query.targetType;
    if (query.targetId) filter.targetId = query.targetId;
    if (query.action) filter.action = query.action;
    const range = dateRange(query.from, query.to);
    if (range) filter.createdAt = range;
    if (query.search) filter.summary = new RegExp(escapeRegex(query.search), 'i');

    const [docs, totalItems] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean<AuditLogDocument[]>(),
      AuditLogModel.countDocuments(filter),
    ]);
    return paginate(docs.map(toResponse), { page: query.page, limit: query.limit, totalItems });
  }

  /** Distinct action verbs recorded so far — feeds the audit-log filter dropdown. */
  async actions(): Promise<string[]> {
    const actions = await AuditLogModel.distinct('action');
    return (actions as string[]).sort();
  }

  private async actorName(actorId: string): Promise<string> {
    const cached = this.nameCache.get(actorId);
    if (cached) return cached;
    const actor = await UserModel.findById(actorId).select('firstName lastName').lean();
    const name = actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Unknown admin';
    this.nameCache.set(actorId, name);
    return name;
  }
}

export const auditService = new AuditService();
