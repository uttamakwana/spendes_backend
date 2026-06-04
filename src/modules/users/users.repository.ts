import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AbstractRepository } from '../../database/abstract.repository';
import { User } from './schemas/user.schema';

@Injectable()
export class UsersRepository extends AbstractRepository<User> {
  protected readonly logger = new Logger(UsersRepository.name);

  constructor(@InjectModel(User.name) userModel: Model<User>) {
    super(userModel);
  }

  /**
   * Finds a user by their (dialCode, phoneNumber) identity. The refresh-token
   * hash is excluded unless `withSecrets` is true (used by the auth flow).
   */
  async findByPhone(
    dialCode: string,
    phoneNumber: string,
    withSecrets = false,
  ): Promise<User | null> {
    const query = this.model.findOne({ dialCode, phoneNumber });
    if (withSecrets) {
      query.select('+refreshTokenHash');
    }
    return query.lean<User>(true).exec();
  }

  /** Finds a user by id including the stored refresh-token hash (for token rotation). */
  async findByIdWithRefreshToken(id: string): Promise<User | null> {
    return this.model.findById(id).select('+refreshTokenHash').lean<User>(true).exec();
  }
}
