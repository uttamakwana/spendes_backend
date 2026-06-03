import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../constants';

/**
 * Restricts a route to users holding at least one of the given roles.
 * Enforced by the RolesGuard. Has no effect on routes marked \@Public().
 *
 * @example
 * \@Roles(Role.Admin)
 * \@Get('admin/stats')
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
