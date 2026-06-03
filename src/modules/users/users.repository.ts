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
   * Finds a user by email. Password and refresh-token hashes are excluded unless
   * `withSecrets` is true (used by the authentication flow).
   */
  async findByEmail(email: string, withSecrets = false): Promise<User | null> {
    const query = this.model.findOne({ email: email.toLowerCase() });
    if (withSecrets) {
      query.select('+password +refreshTokenHash');
    }
    return query.lean<User>(true).exec();
  }

  /** Finds a user by id including the stored refresh-token hash (for token rotation). */
  async findByIdWithRefreshToken(id: string): Promise<User | null> {
    return this.model.findById(id).select('+refreshTokenHash').lean<User>(true).exec();
  }
}
