import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';
import { User } from '../schemas/user.schema';

/**
 * The public-facing representation of a user. Built explicitly via {@link fromEntity}
 * so sensitive fields (refresh-token hash) can never leak.
 */
export class UserResponseDto {
  @ApiProperty({ example: '665f1b2c8e4b2a0012a3b4c5' })
  id: string;

  @ApiProperty({ example: '+91' })
  dialCode: string;

  @ApiProperty({ example: '9876543210' })
  phoneNumber: string;

  @ApiProperty({ example: '+919876543210', description: 'Full E.164 number for display.' })
  phoneE164: string;

  @ApiPropertyOptional({ example: 'jane.doe@example.com' })
  email?: string;

  @ApiProperty({ example: 'Jane' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiProperty({ enum: Role, isArray: true, example: [Role.User] })
  roles: Role[];

  @ApiProperty({ example: 'INR' })
  defaultCurrency: string;

  @ApiProperty({ example: true })
  isPhoneVerified: boolean;

  @ApiProperty({ example: false })
  isEmailVerified: boolean;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional()
  lastLoginAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user._id.toString();
    dto.dialCode = user.dialCode;
    dto.phoneNumber = user.phoneNumber;
    dto.phoneE164 = `${user.dialCode}${user.phoneNumber}`;
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.fullName = `${user.firstName} ${user.lastName}`.trim();
    dto.avatarUrl = user.avatarUrl;
    dto.roles = user.roles;
    dto.defaultCurrency = user.defaultCurrency;
    dto.isPhoneVerified = user.isPhoneVerified;
    dto.isEmailVerified = user.isEmailVerified;
    dto.isActive = user.isActive;
    dto.lastLoginAt = user.lastLoginAt;
    dto.createdAt = user.createdAt as Date;
    dto.updatedAt = user.updatedAt as Date;
    return dto;
  }
}
