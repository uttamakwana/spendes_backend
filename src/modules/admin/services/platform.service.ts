import type { Request } from 'express';
import mongoose, { type FilterQuery } from 'mongoose';
import { CategoryType } from '../../../common/enums/category-type';
import { NotFoundException } from '../../../common/errors/http-exception';
import type { PaginatedData } from '../../../common/types/api-response';
import { paginate } from '../../../common/utils/response';
import { COUNTRIES } from '../../../common/reference/countries';
import { CURRENCIES } from '../../../common/reference/currencies';
import { config } from '../../../config';
import {
  CategoryModel,
  ExpenseModel,
  IncomeModel,
  OtpCodeModel,
  WaitlistEntryModel,
} from '../../../database/models.registry';
import { redisService } from '../../../redis/redis.service';
import { AuthEventModel, type AuthEventDocument } from '../../auth/auth-event.model';
import type { WaitlistEntryDocument } from '../../waitlist/waitlist.model';
import { daysAgo, dateRange, escapeRegex, listWithUsers } from '../admin.helpers';
import type {
  BulkWaitlistInput,
  CategoryUsageQuery,
  ClearOtpInput,
  ListAuthEventsQuery,
  ListWaitlistQuery,
  UpdateWaitlistInput,
} from '../admin.validation';
import { auditService } from '../audit/audit.service';

export interface WaitlistResponse {
  id: string;
  email: string;
  source: string;
  invited: boolean;
  invitedAt: Date | null;
  createdAt: Date;
}

function toWaitlistResponse(e: {
  _id: { toString(): string };
  email: string;
  source: string;
  invitedAt?: Date | null;
  createdAt: Date;
}): WaitlistResponse {
  return {
    id: e._id.toString(),
    email: e.email,
    source: e.source,
    invited: Boolean(e.invitedAt),
    invitedAt: e.invitedAt ?? null,
    createdAt: e.createdAt,
  };
}

/** Waitlist, reference-data usage, auth activity and system/runtime information. */
class AdminPlatformService {
  // -------------------------------------------------------------------------
  // Waitlist
  // -------------------------------------------------------------------------

  async listWaitlist(query: ListWaitlistQuery): Promise<PaginatedData<WaitlistResponse>> {
    const filter: FilterQuery<WaitlistEntryDocument> = {};
    if (query.invited !== undefined) filter.invitedAt = query.invited ? { $ne: null } : null;
    if (query.source) filter.source = query.source;
    if (query.search) filter.email = new RegExp(escapeRegex(query.search), 'i');

    const sort = query.sortBy
      ? { [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1 }
      : { createdAt: -1 };
    const [docs, totalItems] = await Promise.all([
      WaitlistEntryModel.find(filter)
        .sort(sort as Record<string, 1 | -1>)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      WaitlistEntryModel.countDocuments(filter),
    ]);
    return paginate(docs.map(toWaitlistResponse), {
      page: query.page,
      limit: query.limit,
      totalItems,
    });
  }

  async waitlistSources(): Promise<{ key: string; count: number }[]> {
    const rows = await WaitlistEntryModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return rows.map((r) => ({ key: r._id ?? 'unknown', count: r.count }));
  }

  async updateWaitlist(req: Request, id: string, body: UpdateWaitlistInput) {
    const entry = await WaitlistEntryModel.findById(id);
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    entry.invitedAt = body.invited ? new Date() : undefined;
    await entry.save();
    await auditService.record(req, {
      action: body.invited ? 'waitlist.invite' : 'waitlist.uninvite',
      targetType: 'waitlist',
      targetId: id,
      summary: `${body.invited ? 'Marked invited' : 'Marked pending'}: ${entry.email}`,
    });
    return toWaitlistResponse(entry);
  }

  async deleteWaitlist(req: Request, id: string): Promise<void> {
    const deleted = await WaitlistEntryModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Waitlist entry not found');
    await auditService.record(req, {
      action: 'waitlist.delete',
      targetType: 'waitlist',
      targetId: id,
      summary: `Removed ${deleted.email} from the waitlist`,
    });
  }

  async bulkWaitlist(req: Request, body: BulkWaitlistInput): Promise<{ affected: number }> {
    const filter = { _id: { $in: body.ids } };
    let affected = 0;
    if (body.action === 'delete') {
      affected = (await WaitlistEntryModel.deleteMany(filter)).deletedCount ?? 0;
    } else {
      const update =
        body.action === 'invite'
          ? { $set: { invitedAt: new Date() } }
          : { $unset: { invitedAt: 1 } };
      affected = (await WaitlistEntryModel.updateMany(filter, update)).modifiedCount ?? 0;
    }
    await auditService.record(req, {
      action: `waitlist.bulk_${body.action}`,
      targetType: 'waitlist',
      summary: `Bulk ${body.action}: ${affected} waitlist entr${affected === 1 ? 'y' : 'ies'}`,
      meta: { ids: body.ids },
    });
    return { affected };
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /**
   * How often each category label is used. Expense/income `category` is a free-form
   * label, so this also surfaces labels with no matching managed category
   * (`managed: false`) — candidates to add, or data to clean up.
   */
  async categoryUsage(query: CategoryUsageQuery) {
    const model = query.type === CategoryType.Income ? IncomeModel : ExpenseModel;
    const [rows, categories] = await Promise.all([
      (model as typeof ExpenseModel).aggregate<{ _id: string; count: number; users: unknown[] }>([
        {
          $group: {
            _id: { $toLower: '$category' },
            count: { $sum: 1 },
            users: { $addToSet: '$userId' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 500 },
      ]),
      CategoryModel.find({ type: query.type }).select('name slug').lean(),
    ]);
    const managed = new Map<string, string>();
    for (const c of categories) {
      managed.set(c.name.toLowerCase(), c._id.toString());
      managed.set(c.slug.toLowerCase(), c._id.toString());
    }
    return rows.map((r) => ({
      label: r._id,
      count: r.count,
      users: r.users.length,
      categoryId: managed.get(r._id) ?? null,
      managed: managed.has(r._id),
    }));
  }

  // -------------------------------------------------------------------------
  // Auth activity & OTP
  // -------------------------------------------------------------------------

  async listAuthEvents(query: ListAuthEventsQuery) {
    const filter: FilterQuery<AuthEventDocument> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.type) filter.type = query.type;
    if (query.success !== undefined) filter.success = query.success;
    if (query.phone) {
      filter.phoneNumber = new RegExp(escapeRegex(query.phone.replace(/\D/g, '')));
    }
    const when = dateRange(query.from, query.to);
    if (when) filter.createdAt = when;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ reason: rx }, { ip: rx }, { userAgent: rx }];
    }
    return listWithUsers(AuthEventModel, filter, query, { createdAt: -1 });
  }

  async authStats() {
    const d1 = daysAgo(1);
    const [byType, topFailingPhones, topFailingIps] = await Promise.all([
      AuthEventModel.aggregate<{ _id: { type: string; success: boolean }; count: number }>([
        { $match: { createdAt: { $gte: d1 } } },
        { $group: { _id: { type: '$type', success: '$success' }, count: { $sum: 1 } } },
      ]),
      AuthEventModel.aggregate<{
        _id: { dialCode: string; phoneNumber: string };
        count: number;
        last: Date;
      }>([
        { $match: { createdAt: { $gte: d1 }, success: false, phoneNumber: { $exists: true } } },
        {
          $group: {
            _id: { dialCode: '$dialCode', phoneNumber: '$phoneNumber' },
            count: { $sum: 1 },
            last: { $max: '$createdAt' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuthEventModel.aggregate<{ _id: string; count: number; last: Date }>([
        { $match: { createdAt: { $gte: d1 }, success: false, ip: { $exists: true } } },
        { $group: { _id: '$ip', count: { $sum: 1 }, last: { $max: '$createdAt' } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);
    return {
      window: '24h',
      byType: byType.map((r) => ({ type: r._id.type, success: r._id.success, count: r.count })),
      topFailingPhones: topFailingPhones.map((r) => ({
        dialCode: r._id.dialCode,
        phoneNumber: r._id.phoneNumber,
        count: r.count,
        last: r.last,
      })),
      topFailingIps: topFailingIps.map((r) => ({ ip: r._id, count: r.count, last: r.last })),
    };
  }

  /** Active (unexpired) verification codes. The code hash is never exposed. */
  async pendingOtps() {
    const rows = await OtpCodeModel.find({ expiresAt: { $gt: new Date() } })
      .select('dialCode phoneNumber attempts expiresAt createdAt')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return {
      maxAttempts: config.otp.maxAttempts,
      items: rows.map((r) => ({
        id: r._id.toString(),
        dialCode: r.dialCode,
        phoneNumber: r.phoneNumber,
        attempts: r.attempts,
        locked: r.attempts >= config.otp.maxAttempts,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Drops pending codes for a phone — lifts an attempt lockout and the resend cooldown. */
  async clearOtp(req: Request, body: ClearOtpInput): Promise<{ cleared: number }> {
    const { deletedCount } = await OtpCodeModel.deleteMany({
      dialCode: body.dialCode,
      phoneNumber: body.phoneNumber,
    });
    await auditService.record(req, {
      action: 'otp.clear',
      targetType: 'phone',
      targetId: `${body.dialCode}${body.phoneNumber}`,
      summary: `Cleared ${deletedCount ?? 0} pending code(s) for ${body.dialCode}${body.phoneNumber}`,
    });
    return { cleared: deletedCount ?? 0 };
  }

  // -------------------------------------------------------------------------
  // System
  // -------------------------------------------------------------------------

  async system() {
    const db = mongoose.connection.db;
    const started = Date.now();
    let mongo: { status: 'up' | 'down'; latencyMs?: number; message?: string };
    try {
      await db!.admin().ping();
      mongo = { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      mongo = { status: 'down', message: (error as Error).message };
    }

    let redis: { status: 'up' | 'down' | 'disabled'; message?: string };
    if (!redisService.isEnabled) {
      redis = { status: 'disabled' };
    } else {
      try {
        redis = { status: (await redisService.ping()) === 'PONG' ? 'up' : 'down' };
      } catch (error) {
        redis = { status: 'down', message: (error as Error).message };
      }
    }

    const collections = db
      ? await Promise.all(
          (await db.listCollections({}, { nameOnly: true }).toArray()).map(async (c) => ({
            name: c.name,
            documents: await db.collection(c.name).estimatedDocumentCount(),
          })),
        )
      : [];
    const dbStats = db
      ? ((await db.stats()) as {
          dataSize: number;
          storageSize: number;
          indexSize: number;
          indexes: number;
        })
      : null;

    const mem = process.memoryUsage();
    const smsConfigured =
      config.sms.provider !== 'twilio' ||
      Boolean(config.sms.twilio.accountSid && config.sms.twilio.authToken);

    return {
      health: { api: 'up', mongo, redis },
      runtime: {
        appName: config.app.name,
        version: process.env.npm_package_version ?? '0.1.0',
        environment: config.app.env,
        node: process.version,
        platform: process.platform,
        uptimeSeconds: Math.round(process.uptime()),
        memory: {
          rssMb: Math.round(mem.rss / 1_048_576),
          heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
          heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
        },
        serverTime: new Date(),
      },
      database: {
        name: db?.databaseName ?? null,
        dataSizeMb: dbStats ? +(dbStats.dataSize / 1_048_576).toFixed(2) : null,
        storageSizeMb: dbStats ? +(dbStats.storageSize / 1_048_576).toFixed(2) : null,
        indexSizeMb: dbStats ? +(dbStats.indexSize / 1_048_576).toFixed(2) : null,
        indexes: dbStats?.indexes ?? null,
        collections: collections.sort((a, b) => b.documents - a.documents),
      },
      // Flags and provider names only — never secrets.
      config: {
        auth: {
          otpMockEnabled: config.otp.mockEnabled,
          otpLength: config.otp.length,
          otpTtlSeconds: config.otp.ttlSeconds,
          otpMaxAttempts: config.otp.maxAttempts,
          otpResendCooldownSeconds: config.otp.resendCooldownSeconds,
          accessTokenTtl: config.jwt.access.expiresIn,
          refreshTokenTtl: config.jwt.refresh.expiresIn,
        },
        providers: {
          sms: config.sms.provider,
          smsConfigured,
          payments: config.payments.provider,
          storage: config.storage.provider,
          ai: config.ai.provider,
          aiModel: config.ai.model,
          aiKeyConfigured: Boolean(config.ai.anthropic.apiKey),
          pushEnhancedSecurity: Boolean(config.push.expoAccessToken),
        },
        features: {
          entitlementsEnforced: config.entitlements.enforced,
          redisEnabled: config.redis.enabled,
          swaggerEnabled: config.swagger.enabled,
        },
        phone: {
          defaultDialCode: config.phone.defaultDialCode,
          allowedDialCodes: config.phone.allowedDialCodes,
        },
        http: {
          corsOrigins: config.app.corsOrigins,
          apiPrefix: `/${config.app.apiPrefix}/v${config.app.apiVersion}`,
        },
      },
      reference: {
        countries: COUNTRIES.length,
        currencies: Object.keys(CURRENCIES).length,
      },
    };
  }
}

export const adminPlatformService = new AdminPlatformService();
