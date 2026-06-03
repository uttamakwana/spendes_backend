import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants';

/**
 * Marks a route (or whole controller) as publicly accessible, bypassing the
 * globally-registered JwtAuthGuard. Use sparingly — auth is on by default.
 *
 * @example
 * \@Public()
 * \@Post('login')
 * login() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
