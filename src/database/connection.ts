import mongoose from 'mongoose';
import { config } from '../config';
import { createLogger } from '../logger';

const logger = createLogger('Database');

/**
 * Establishes the application-wide MongoDB connection via Mongoose and wires
 * lifecycle logging. Indexes are only auto-built outside production (where
 * migrations / explicit index management are preferred). Replaces NestJS's
 * `DatabaseModule` + `MongooseModule.forRootAsync`.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  mongoose.connection.on('connected', () => logger.info('MongoDB connection established'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (error: Error) =>
    logger.error({ err: error }, `MongoDB connection error: ${error.message}`),
  );

  await mongoose.connect(config.database.uri, {
    dbName: config.database.dbName,
    autoIndex: !config.app.isProduction,
    retryWrites: true,
    serverSelectionTimeoutMS: 10_000,
  });

  return mongoose;
}

/** Closes the MongoDB connection (used on graceful shutdown). */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
}
