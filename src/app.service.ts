import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfiguration } from './config';

export interface AppInfo {
  name: string;
  version: string;
  environment: string;
  apiVersion: string;
  docs: string;
}

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService<AppConfiguration, true>) {}

  getInfo(): AppInfo {
    const app = this.configService.get('app', { infer: true });
    const swagger = this.configService.get('swagger', { infer: true });

    return {
      name: app.name,
      version: process.env.npm_package_version ?? '0.1.0',
      environment: app.env,
      apiVersion: `v${app.apiVersion}`,
      docs: swagger.enabled ? `/${swagger.path}` : 'disabled',
    };
  }
}
