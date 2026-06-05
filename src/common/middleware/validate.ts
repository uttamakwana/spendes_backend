import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { BadRequestException } from '../errors/http-exception';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

interface FieldError {
  field: string;
  message: string;
}

const flatten = (error: ZodError): FieldError[] =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

/**
 * Validates and coerces the request `body`, `query` and/or `params` against the
 * given Zod schemas, replacing each part with the parsed (typed, defaulted) value.
 * On failure it throws a `BadRequestException` carrying field-level details — the
 * Express equivalent of NestJS's global `ValidationPipe`.
 *
 * Unknown fields are stripped automatically when schemas use `z.object` (Zod's
 * default), mirroring `whitelist: true`.
 *
 * @example
 * router.post('/login', validate({ body: loginSchema }), login);
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        // Express 5 exposes `req.query` as a getter with no setter, so assign via
        // defineProperty to store the parsed/coerced value.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new BadRequestException('Validation failed', flatten(error)));
        return;
      }
      next(error);
    }
  };
}
