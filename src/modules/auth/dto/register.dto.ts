import { CreateUserDto } from '../../users/dto/create-user.dto';

/**
 * Registration payload — identical to the user-creation contract.
 * Kept as a distinct type so the auth and user APIs can evolve independently.
 */
export class RegisterDto extends CreateUserDto {}
