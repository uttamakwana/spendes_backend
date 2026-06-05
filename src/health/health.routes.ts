import { Router } from 'express';
import { check } from './health.controller';

export const healthRouter: Router = Router();

healthRouter.get('/', check);
