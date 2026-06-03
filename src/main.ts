import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfiguration } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const configService: ConfigService<AppConfiguration, true> = app.get(ConfigService);
  const appConfig = configService.get('app', { infer: true });
  const swaggerConfig = configService.get('swagger', { infer: true });

  // Route Nest's own logs through Pino.
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  // Security & performance middleware.
  app.use(helmet());
  app.use(compression());
  app.enableCors({ origin: appConfig.corsOrigins, credentials: true });

  // Routing: /<prefix>/v<version>/...
  app.setGlobalPrefix(appConfig.apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: appConfig.apiVersion });

  // Graceful shutdown (close Mongo/Redis connections on SIGTERM/SIGINT).
  app.enableShutdownHooks();

  // OpenAPI / Swagger docs.
  if (swaggerConfig.enabled) {
    const documentConfig = new DocumentBuilder()
      .setTitle('Spendes API')
      .setDescription('Expense tracking, splitting, budgeting & financial analysis API')
      .setVersion(appConfig.apiVersion)
      .addBearerAuth()
      .addServer(`/${appConfig.apiPrefix}/v${appConfig.apiVersion}`)
      .build();

    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup(swaggerConfig.path, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(appConfig.port, '0.0.0.0');

  const base = `http://localhost:${appConfig.port}/${appConfig.apiPrefix}/v${appConfig.apiVersion}`;
  logger.log(`🚀 Spendes API is running at ${base}`, 'Bootstrap');
  if (swaggerConfig.enabled) {
    logger.log(
      `📚 API docs available at http://localhost:${appConfig.port}/${swaggerConfig.path}`,
      'Bootstrap',
    );
  }
}

void bootstrap();
