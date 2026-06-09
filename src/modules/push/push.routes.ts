import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { authenticate } from '../auth/auth.middleware';
import { registerPushToken, unregisterPushToken } from './push.controller';
import { registerPushTokenSchema, unregisterPushTokenSchema } from './push.validation';

export const pushRouter: Router = Router();

// A push token is always registered against the authenticated user.
pushRouter.use(authenticate);

pushRouter.post('/register', validate({ body: registerPushTokenSchema }), registerPushToken);
pushRouter.post('/unregister', validate({ body: unregisterPushTokenSchema }), unregisterPushToken);
