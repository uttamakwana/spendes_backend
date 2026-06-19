import type { FilterQuery, UpdateQuery } from 'mongoose';
import { ConflictException, NotFoundException } from '../../common/errors/http-exception';
import { buildSort, type PaginationQuery } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { storageService } from '../storage/storage.service';
import { cascadeDeleteUser, type CascadeResult } from './user-cascade';
import { toUserResponse, type UserResponse } from './user-response';
import { resolveNotificationPreferences, type UserDocument } from './users.model';
import type { UpdateNotificationPreferencesInput, UpdateUserInput } from './users.validation';
import { usersRepository, UsersRepository } from './users.repository';

/** Normalized identity + profile used to provision an account (post OTP verify). */
export interface CreateUserData {
  dialCode: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  defaultCurrency?: string;
  isPhoneVerified?: boolean;
}

export class UsersService {
  private readonly logger = createLogger('UsersService');

  constructor(private readonly repository: UsersRepository) {}

  async findAll(query: PaginationQuery): Promise<PaginatedData<UserResponse>> {
    const filter: FilterQuery<UserDocument> = {};
    if (query.search) {
      const term = new RegExp(query.search, 'i');
      filter.$or = [
        { phoneNumber: term },
        { email: term },
        { firstName: term },
        { lastName: term },
      ];
    }

    const result = await this.repository.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: buildSort(query) ?? { createdAt: -1 },
    });

    return paginate(result.items.map(toUserResponse), {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    });
  }

  async findById(id: string): Promise<UserResponse> {
    const user = await this.repository.findByIdOrThrow(id);
    return toUserResponse(user);
  }

  async update(id: string, dto: UpdateUserInput): Promise<UserResponse> {
    if (dto.email) {
      const clash = await this.repository.findOne({
        email: dto.email.toLowerCase(),
        _id: { $ne: id },
      });
      if (clash) {
        throw new ConflictException('That email is already in use');
      }
    }

    const user = await this.repository.updateById(id, dto);
    return toUserResponse(user);
  }

  /** Merges a partial notification-preference change into the user's saved set. */
  async updateNotificationPreferences(
    id: string,
    dto: UpdateNotificationPreferencesInput,
  ): Promise<UserResponse> {
    const existing = await this.repository.findByIdOrThrow(id);
    const next = { ...resolveNotificationPreferences(existing.notificationPreferences), ...dto };
    const user = await this.repository.updateById(id, { notificationPreferences: next });
    return toUserResponse(user);
  }

  /**
   * Sets a new profile photo: stores the bytes via the configured storage provider,
   * points `avatarUrl`/`avatarKey` at the new file, and best-effort deletes the old
   * one (never blocks the response). The image is validated/size-limited upstream.
   */
  async setAvatar(
    id: string,
    file: { buffer: Buffer; mimetype: string },
    baseUrl?: string,
  ): Promise<UserResponse> {
    const existing = await this.repository.findByIdOrThrow(id);
    const stored = await storageService.upload({
      buffer: file.buffer,
      mimetype: file.mimetype,
      keyHint: id,
      baseUrl,
    });
    const previousKey = existing.avatarKey;
    const user = await this.repository.updateById(id, {
      avatarUrl: stored.url,
      avatarKey: stored.key,
    });
    if (previousKey && previousKey !== stored.key) {
      void storageService.remove(previousKey);
    }
    this.logger.info(`Avatar updated for ${id}`);
    return toUserResponse(user);
  }

  /** Removes the profile photo and best-effort deletes the stored file. */
  async removeAvatar(id: string): Promise<UserResponse> {
    const existing = await this.repository.findByIdOrThrow(id);
    if (existing.avatarKey) {
      void storageService.remove(existing.avatarKey);
    }
    const user = await this.repository.updateById(id, {
      $unset: { avatarUrl: 1, avatarKey: 1 },
    } as UpdateQuery<UserDocument>);
    return toUserResponse(user);
  }

  /**
   * Permanently deletes a user and every record tied to them — expenses, income,
   * budgets, EMIs, goals, investments, push tokens, notifications, the groups they
   * own (with those groups' splits & settlements), the splits/settlements they
   * authored in others' groups, and their OTP codes. They're also dropped from
   * groups owned by other people. Reuses the exact cascade shared with the
   * `db:delete-user` CLI; categories are never touched. Returns the per-collection
   * breakdown. Backs both the admin delete endpoint and self-service deletion.
   *
   * Because the auth middleware re-checks the user exists on every request, removing
   * the account invalidates all of its access/refresh tokens immediately.
   */
  async remove(id: string): Promise<CascadeResult> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundException('Account not found');
    }
    return cascadeDeleteUser(
      { _id: user._id, dialCode: user.dialCode, phoneNumber: user.phoneNumber },
      { apply: true },
    );
  }

  /** Self-service account deletion — the shared cascade, with an audit log line. */
  async deleteAccount(userId: string): Promise<CascadeResult> {
    const result = await this.remove(userId);
    this.logger.info(`Account self-deleted: ${userId} — ${result.total} document(s) removed`);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Methods consumed by the Auth module (work with raw entities, not responses)
  // ---------------------------------------------------------------------------

  /** Creates a user from verified registration data and returns the raw entity. */
  async createFromRegistration(data: CreateUserData): Promise<UserDocument> {
    await this.assertPhoneAvailable(data.dialCode, data.phoneNumber);

    const user = await this.repository.create({
      dialCode: data.dialCode,
      phoneNumber: data.phoneNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email?.toLowerCase(),
      defaultCurrency: data.defaultCurrency,
      isPhoneVerified: data.isPhoneVerified ?? true,
    });
    this.logger.info(`User registered: ${user._id.toString()}`);
    return user;
  }

  findByPhone(dialCode: string, phoneNumber: string): Promise<UserDocument | null> {
    return this.repository.findByPhone(dialCode, phoneNumber);
  }

  findByPhoneWithSecrets(dialCode: string, phoneNumber: string): Promise<UserDocument | null> {
    return this.repository.findByPhone(dialCode, phoneNumber, true);
  }

  /** Raw entity lookup used by the auth middleware to confirm the user is still valid. */
  findEntityById(id: string): Promise<UserDocument | null> {
    return this.repository.findById(id);
  }

  findByIdWithRefreshToken(id: string): Promise<UserDocument | null> {
    return this.repository.findByIdWithRefreshToken(id);
  }

  async setRefreshTokenHash(userId: string, hash: string | null): Promise<void> {
    const update: UpdateQuery<UserDocument> = hash
      ? { refreshTokenHash: hash }
      : { $unset: { refreshTokenHash: 1 } };
    await this.repository.updateById(userId, update);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.repository.updateById(userId, { lastLoginAt: new Date() });
  }

  private async assertPhoneAvailable(dialCode: string, phoneNumber: string): Promise<void> {
    const exists = await this.repository.exists({ dialCode, phoneNumber });
    if (exists) {
      throw new ConflictException('An account with this phone number already exists');
    }
  }
}

/** Shared singleton instance used across the app. */
export const usersService = new UsersService(usersRepository);
