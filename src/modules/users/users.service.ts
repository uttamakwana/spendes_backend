import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { FilterQuery, UpdateQuery } from 'mongoose';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/pagination-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './schemas/user.schema';
import { UsersRepository } from './users.repository';

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

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    const filter: FilterQuery<User> = {};
    if (query.search) {
      const term = new RegExp(query.search, 'i');
      filter.$or = [
        { phoneNumber: term },
        { email: term },
        { firstName: term },
        { lastName: term },
      ];
    }

    const result = await this.usersRepository.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: query.sort ?? { createdAt: -1 },
    });

    return PaginatedResponseDto.of(
      result.items.map((user) => UserResponseDto.fromEntity(user)),
      { page: result.page, limit: result.limit, totalItems: result.totalItems },
    );
  }

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findByIdOrThrow(id);
    return UserResponseDto.fromEntity(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    if (dto.email) {
      const clash = await this.usersRepository.findOne({
        email: dto.email.toLowerCase(),
        _id: { $ne: id },
      });
      if (clash) {
        throw new ConflictException('That email is already in use');
      }
    }

    const user = await this.usersRepository.updateById(id, dto);
    return UserResponseDto.fromEntity(user);
  }

  async remove(id: string): Promise<void> {
    await this.usersRepository.deleteById(id);
  }

  // ---------------------------------------------------------------------------
  // Methods consumed by the Auth module (work with raw entities, not DTOs)
  // ---------------------------------------------------------------------------

  /** Creates a user from verified registration data and returns the raw entity. */
  async createFromRegistration(data: CreateUserData): Promise<User> {
    await this.assertPhoneAvailable(data.dialCode, data.phoneNumber);

    const user = await this.usersRepository.create({
      dialCode: data.dialCode,
      phoneNumber: data.phoneNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email?.toLowerCase(),
      defaultCurrency: data.defaultCurrency,
      isPhoneVerified: data.isPhoneVerified ?? true,
    });
    this.logger.log(`User registered: ${user._id.toString()}`);
    return user;
  }

  findByPhone(dialCode: string, phoneNumber: string): Promise<User | null> {
    return this.usersRepository.findByPhone(dialCode, phoneNumber);
  }

  findByPhoneWithSecrets(dialCode: string, phoneNumber: string): Promise<User | null> {
    return this.usersRepository.findByPhone(dialCode, phoneNumber, true);
  }

  /** Raw entity lookup used by the JWT strategy to confirm the user is still valid. */
  findEntityById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  findByIdWithRefreshToken(id: string): Promise<User | null> {
    return this.usersRepository.findByIdWithRefreshToken(id);
  }

  async setRefreshTokenHash(userId: string, hash: string | null): Promise<void> {
    const update: UpdateQuery<User> = hash
      ? { refreshTokenHash: hash }
      : { $unset: { refreshTokenHash: 1 } };
    await this.usersRepository.updateById(userId, update);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.usersRepository.updateById(userId, { lastLoginAt: new Date() });
  }

  private async assertPhoneAvailable(dialCode: string, phoneNumber: string): Promise<void> {
    const exists = await this.usersRepository.exists({ dialCode, phoneNumber });
    if (exists) {
      throw new ConflictException('An account with this phone number already exists');
    }
  }
}
