import { BaseRepository } from '../../database/base.repository';
import { UserModel, type UserDocument } from './users.model';

/**
 * Data access for users. Inherits generic CRUD + pagination from
 * {@link BaseRepository} and adds the phone-identity and refresh-token lookups
 * the auth flow needs.
 */
export class UsersRepository extends BaseRepository<UserDocument> {
  constructor() {
    super(UserModel);
  }

  /**
   * Finds a user by their (dialCode, phoneNumber) identity. The refresh-token hash
   * is excluded unless `withSecrets` is true (used by the auth flow).
   */
  async findByPhone(
    dialCode: string,
    phoneNumber: string,
    withSecrets = false,
  ): Promise<UserDocument | null> {
    const query = this.model.findOne({ dialCode, phoneNumber });
    if (withSecrets) {
      query.select('+refreshTokenHash');
    }
    return query.lean<UserDocument>(true).exec();
  }

  /** Finds a user by id including the stored refresh-token hash (for token rotation). */
  async findByIdWithRefreshToken(id: string): Promise<UserDocument | null> {
    return this.model.findById(id).select('+refreshTokenHash').lean<UserDocument>(true).exec();
  }
}

/** Shared singleton instance used across the app. */
export const usersRepository = new UsersRepository();
