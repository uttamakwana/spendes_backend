import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { FilterQuery, UpdateQuery } from 'mongoose';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/pagination-response.dto';
import { AppConfiguration } from '../../config';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './schemas/user.schema';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly saltRounds: number;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService<AppConfiguration, true>,
  ) {
    this.saltRounds = this.configService.get('security.bcryptSaltRounds', { infer: true });
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const exists = await this.usersRepository.exists({ email: dto.email.toLowerCase() });
    if (exists) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);
    const user = await this.usersRepository.create({
      ...dto,
      email: dto.email.toLowerCase(),
      password: passwordHash,
    });

    this.logger.log(`User created: ${user._id.toString()}`);
    return UserResponseDto.fromEntity(user);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    const filter: FilterQuery<User> = {};
    if (query.search) {
      const term = new RegExp(query.search, 'i');
      filter.$or = [{ email: term }, { firstName: term }, { lastName: term }];
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
    const user = await this.usersRepository.updateById(id, dto);
    return UserResponseDto.fromEntity(user);
  }

  async remove(id: string): Promise<void> {
    await this.usersRepository.deleteById(id);
  }

  // ---------------------------------------------------------------------------
  // Methods consumed by the Auth module (work with raw entities, not DTOs)
  // ---------------------------------------------------------------------------

  /** Creates a user and returns the raw entity — used by the registration flow. */
  async createFromRegistration(dto: CreateUserDto): Promise<User> {
    const exists = await this.usersRepository.exists({ email: dto.email.toLowerCase() });
    if (exists) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);
    const user = await this.usersRepository.create({
      ...dto,
      email: dto.email.toLowerCase(),
      password: passwordHash,
    });
    this.logger.log(`User registered: ${user._id.toString()}`);
    return user;
  }

  findByEmailWithSecrets(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email, true);
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
}
