import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, ResponseMessage } from './common';
import { AppInfo, AppService } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'API metadata and links' })
  @ResponseMessage('Welcome to the Spendes API')
  getInfo(): AppInfo {
    return this.appService.getInfo();
  }
}
