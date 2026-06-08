import type { Server } from 'http';
import { createApp } from './app';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './database/connection';
import { logger } from './logger';
import { seedCategories } from './modules/categories/categories.seed';
import { redisService } from './redis/redis.service';

/** Connects infrastructure, starts the HTTP server, and wires graceful shutdown. */
async function bootstrap(): Promise<void> {
  await connectDatabase();

  // Ensure the default system categories exist. Idempotent and non-fatal — a failure
  // here should log but never block the API from starting.
  try {
    await seedCategories();
  } catch (error) {
    logger.error({ err: error }, 'Category seeding failed — continuing startup');
  }

  const app = createApp();

  const server = app.listen(config.app.port, '0.0.0.0', () => {
    const base = `http://localhost:${config.app.port}/${config.app.apiPrefix}/v${config.app.apiVersion}`;
    logger.info(`🚀 Spendes API is running at ${base}`);
    if (config.swagger.enabled) {
      logger.info(
        `📚 API docs available at http://localhost:${config.app.port}/${config.swagger.path}`,
      );
    }
  });

  setupGracefulShutdown(server);
}

/** Closes the HTTP server, then MongoDB and Redis, on SIGTERM/SIGINT. */
function setupGracefulShutdown(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`${signal} received — shutting down gracefully`);

    server.close(() => {
      void (async () => {
        try {
          await disconnectDatabase();
          await redisService.close();
          logger.info('Shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error({ err: error }, 'Error during shutdown');
          process.exit(1);
        }
      })();
    });

    // Don't hang forever if connections refuse to close.
    setTimeout(() => {
      logger.error('Could not close connections in time — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}

void bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start application');
  process.exit(1);
});
