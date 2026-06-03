import { SetMetadata } from '@nestjs/common';
import { RESPONSE_MESSAGE_KEY } from '../constants';

/**
 * Sets a human-friendly `message` on the standard success envelope for a route.
 * Read by the TransformInterceptor.
 *
 * @example
 * \@ResponseMessage('Profile updated successfully')
 * \@Patch('me')
 */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE_KEY, message);
