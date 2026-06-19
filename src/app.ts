import express, { type Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { errorHandler } from './common/middleware/error-handler';
import { notFoundHandler } from './common/middleware/not-found-handler';
import { createRateLimiter } from './common/middleware/rate-limit';
import { requestId } from './common/middleware/request-id';
import { requestLogger } from './common/middleware/request-logger';
import { timeout } from './common/middleware/timeout';
import { buildOpenApiDocument } from './openapi/document';
import { UPLOADS_ROOT } from './modules/storage/local.provider';
import { apiRouter } from './routes';

/**
 * Builds and wires the Express application: security/performance middleware,
 * structured logging, validation-backed routing, Swagger docs, and the central
 * 404 + error handlers. This is the Express equivalent of NestJS's `main.ts`
 * bootstrap + global pipes/guards/interceptors/filters.
 */
export function createApp(): Express {
  const app = express();

  // Trust the first proxy hop (correct client IPs behind a load balancer / nginx).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Correlation id first, so every subsequent log line and response can carry it.
  app.use(requestId);
  app.use(requestLogger);

  // Security & performance middleware.
  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: config.app.corsOrigins === '*' ? true : config.app.corsOrigins,
      credentials: true,
    }),
  );

  // Body parsing.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Abort hung requests with a clean 408.
  app.use(timeout());

  // Serve locally-stored uploads (avatars) when STORAGE_PROVIDER=local. The
  // cross-origin resource policy lets the mobile app load these images; in
  // production Cloudinary serves avatars from its own CDN and this is unused.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(UPLOADS_ROOT, { index: false, maxAge: '7d' }),
  );

  // OpenAPI / Swagger docs (served outside the API prefix, like before).
  if (config.swagger.enabled) {
    const document = buildOpenApiDocument();
    app.use(
      `/${config.swagger.path}`,
      swaggerUi.serve,
      swaggerUi.setup(document, { swaggerOptions: { persistAuthorization: true } }),
    );
  }

  // Versioned API, mounted at /<prefix>/v<version> (e.g. /api/v1). The global
  // rate limiter guards the API surface (not the docs/static assets).
  const basePath = `/${config.app.apiPrefix}/v${config.app.apiVersion}`;
  app.use(basePath, createRateLimiter(config.throttle.limit, config.throttle.ttl), apiRouter);

  // Unknown routes → 404 envelope, then the catch-all error handler (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
