import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppConfiguration } from '../config';

/**
 * Establishes the application-wide MongoDB connection via Mongoose.
 * Connection lifecycle events are logged; indexes are only auto-built outside
 * production (where migrations/explicit index management are preferred).
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfiguration, true>) => {
        const logger = new Logger('DatabaseModule');
        const database = configService.get('database', { infer: true });
        const isProduction = configService.get('app.isProduction', { infer: true });

        return {
          uri: database.uri,
          dbName: database.dbName,
          autoIndex: !isProduction,
          retryAttempts: 3,
          retryDelay: 2_000,
          connectionFactory: (connection: Connection) => {
            connection.on('connected', () => logger.log('MongoDB connection established'));
            connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
            connection.on('reconnected', () => logger.log('MongoDB reconnected'));
            connection.on('error', (error: Error) =>
              logger.error(`MongoDB connection error: ${error.message}`, error.stack),
            );
            return connection;
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
