import type { Request } from 'express';
import type { FilterQuery, Types } from 'mongoose';
import { NotFoundException } from '../../../common/errors/http-exception';
import { paginate } from '../../../common/utils/response';
import {
  InsightModel,
  NotificationModel,
  PushTokenModel,
  UserModel,
} from '../../../database/models.registry';
import { config } from '../../../config';
import { createLogger } from '../../../logger';
import type { InsightDocument } from '../../ai/insight.model';
import type { NotificationDocument } from '../../notifications/notification.model';
import { NotificationType } from '../../notifications/notifications.enums';
import type { PushTokenDocument } from '../../push/push-token.model';
import { pushService } from '../../push/push.service';
import type { UserDocument } from '../../users/users.model';
import {
  daysAgo,
  dateRange,
  escapeRegex,
  listWithUsers,
  withId,
  withUsers,
} from '../admin.helpers';
import type {
  BroadcastInput,
  ListInsightsQuery,
  ListNotificationsQuery,
  ListPushTokensQuery,
} from '../admin.validation';
import type { PaginationQuery } from '../../../common/utils/pagination';
import { auditService } from '../audit/audit.service';
import {
  BroadcastAudience,
  BroadcastChannel,
  BroadcastModel,
  type BroadcastDocument,
} from '../broadcast.model';

export interface DeliveryResult {
  recipients: number;
  /** Recipients with at least one registered device (push attempted). */
  pushRecipients: number;
}

/** How many device pushes are in flight at once during a broadcast. */
const PUSH_CONCURRENCY = 10;

/** Notifications, announcements/broadcasts, devices and AI insights. */
class AdminEngagementService {
  private readonly logger = createLogger('AdminEngagementService');

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  async listNotifications(query: ListNotificationsQuery) {
    const filter: FilterQuery<NotificationDocument> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.type) filter.type = query.type;
    if (query.isRead !== undefined) filter.isRead = query.isRead;
    if (query.isDisputed !== undefined) filter.isDisputed = query.isDisputed;
    const range = dateRange(query.from, query.to);
    if (range) filter.createdAt = range;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ title: rx }, { body: rx }, { actorName: rx }];
    }
    return listWithUsers(NotificationModel, filter, query, { createdAt: -1 });
  }

  async deleteNotification(req: Request, id: string): Promise<void> {
    const doc = await NotificationModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Notification not found');
    await auditService.record(req, {
      action: 'notification.delete',
      targetType: 'notification',
      targetId: id,
      summary: `Deleted notification "${doc.title}"`,
      meta: { userId: doc.userId.toString(), type: doc.type },
    });
  }

  // -------------------------------------------------------------------------
  // Announcements & broadcasts
  // -------------------------------------------------------------------------

  /**
   * Writes an `announcement` into each user's inbox and (unless inbox-only) pushes
   * it to their devices. Pushes go out in the background with bounded concurrency;
   * the call returns once the inbox rows are written.
   */
  async deliverAnnouncement(
    userIds: Types.ObjectId[],
    title: string,
    body: string,
    channel: BroadcastChannel,
  ): Promise<DeliveryResult> {
    if (userIds.length === 0) return { recipients: 0, pushRecipients: 0 };

    const docs = await NotificationModel.insertMany(
      userIds.map((userId) => ({
        userId,
        type: NotificationType.Announcement,
        title,
        body,
        actorName: 'Spendes',
      })),
      { ordered: false },
    );

    const withDevices = new Set(
      (await PushTokenModel.distinct('userId', { userId: { $in: userIds } })).map(String),
    );

    if (channel === BroadcastChannel.InboxAndPush && withDevices.size > 0) {
      const jobs = docs
        .filter((d) => withDevices.has(d.userId.toString()))
        .map(
          (d) => () =>
            pushService.sendToUser(d.userId.toString(), {
              title,
              body,
              data: { type: NotificationType.Announcement, notificationId: d._id.toString() },
            }),
        );
      void this.runPool(jobs).catch((error: Error) =>
        this.logger.warn(`Broadcast push fan-out failed: ${error.message}`),
      );
    }

    return {
      recipients: docs.length,
      pushRecipients: channel === BroadcastChannel.InboxAndPush ? withDevices.size : 0,
    };
  }

  /** Resolves the audience to active user ids. */
  async resolveAudience(audience: BroadcastAudience, values: string[]): Promise<Types.ObjectId[]> {
    const filter: FilterQuery<UserDocument> = { isActive: true };
    if (audience === BroadcastAudience.Plan) filter.plan = { $in: values };
    if (audience === BroadcastAudience.Country) {
      filter.country = { $in: values.map((v) => v.toUpperCase()) };
    }
    if (audience === BroadcastAudience.Users) filter._id = { $in: values };
    const users = await UserModel.find(filter).select('_id').lean();
    return users.map((u) => u._id);
  }

  async broadcast(req: Request, input: BroadcastInput) {
    const userIds = await this.resolveAudience(input.audience, input.audienceValues);

    if (input.dryRun) {
      const pushRecipients =
        input.channel === BroadcastChannel.InboxAndPush
          ? (await PushTokenModel.distinct('userId', { userId: { $in: userIds } })).length
          : 0;
      return { dryRun: true, recipients: userIds.length, pushRecipients };
    }

    const result = await this.deliverAnnouncement(userIds, input.title, input.body, input.channel);
    const admin = await UserModel.findById(req.user!.id).select('firstName lastName').lean();
    const record = await BroadcastModel.create({
      title: input.title,
      body: input.body,
      audience: input.audience,
      audienceValues: input.audienceValues,
      channel: input.channel,
      recipients: result.recipients,
      pushRecipients: result.pushRecipients,
      sentBy: req.user!.id,
      sentByName: admin ? `${admin.firstName} ${admin.lastName}`.trim() : 'Admin',
    });

    await auditService.record(req, {
      action: 'broadcast.send',
      targetType: 'broadcast',
      targetId: record._id.toString(),
      summary: `Broadcast "${input.title}" to ${result.recipients} user(s)`,
      meta: { audience: input.audience, audienceValues: input.audienceValues, ...result },
    });

    return { dryRun: false, id: record._id.toString(), ...result };
  }

  async listBroadcasts(query: PaginationQuery) {
    const filter: FilterQuery<BroadcastDocument> = {};
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ title: rx }, { body: rx }];
    }
    const [docs, totalItems] = await Promise.all([
      BroadcastModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      BroadcastModel.countDocuments(filter),
    ]);
    return paginate(docs.map(withId), { page: query.page, limit: query.limit, totalItems });
  }

  // -------------------------------------------------------------------------
  // Devices
  // -------------------------------------------------------------------------

  async listPushTokens(query: ListPushTokensQuery) {
    const filter: FilterQuery<PushTokenDocument> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.platform) filter.platform = query.platform;
    const range = dateRange(query.from, query.to);
    if (range) filter.updatedAt = range;
    const page = await listWithUsers(PushTokenModel, filter, query, { updatedAt: -1 });
    // Tokens are credentials for pushing to a device — show a prefix only.
    return {
      ...page,
      items: page.items.map((t) => ({
        ...t,
        token: undefined,
        tokenPreview: `${String((t as { token?: string }).token ?? '').slice(0, 22)}…`,
      })),
    };
  }

  async deletePushToken(req: Request, id: string): Promise<void> {
    const doc = await PushTokenModel.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Device not found');
    await auditService.record(req, {
      action: 'device.delete',
      targetType: 'push_token',
      targetId: id,
      summary: `Unregistered a ${doc.platform} device`,
      meta: { userId: doc.userId.toString() },
    });
  }

  // -------------------------------------------------------------------------
  // AI insights
  // -------------------------------------------------------------------------

  async listInsights(query: ListInsightsQuery) {
    const filter: FilterQuery<InsightDocument> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.source) filter.source = query.source;
    const range = dateRange(query.from, query.to);
    if (range) filter.generatedAt = range;
    if (query.search) filter.headline = new RegExp(escapeRegex(query.search), 'i');
    return listWithUsers(
      InsightModel,
      filter,
      query,
      { generatedAt: -1 },
      {
        select: '-brief -fingerprint',
      },
    );
  }

  async getInsight(id: string) {
    const doc = await InsightModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Insight not found');
    return (await withUsers([doc]))[0];
  }

  async aiStats() {
    const d30 = daysAgo(30);
    const [total, last30d, bySource, byModel, usersServed] = await Promise.all([
      InsightModel.estimatedDocumentCount(),
      InsightModel.countDocuments({ generatedAt: { $gte: d30 } }),
      InsightModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      InsightModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$model', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      InsightModel.distinct('userId').then((ids) => ids.length),
    ]);
    return {
      config: {
        provider: config.ai.provider,
        model: config.ai.model,
        maxTokens: config.ai.maxTokens,
        timeoutMs: config.ai.timeoutMs,
        rateLimit: config.ai.rateLimit,
        apiKeyConfigured: Boolean(config.ai.anthropic.apiKey),
      },
      insights: {
        total,
        last30d,
        usersServed,
        bySource: bySource.map((r) => ({ key: r._id, count: r.count })),
        byModel: byModel.map((r) => ({ key: r._id, count: r.count })),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async runPool(jobs: (() => Promise<void>)[]): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        await job();
      }
    };
    await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, jobs.length) }, worker));
  }
}

export const adminEngagementService = new AdminEngagementService();
