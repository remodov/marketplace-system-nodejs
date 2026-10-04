import { Controller, Get, HttpCode } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  @HttpCode(204)
  live(): void {}

  @Get('ready')
  @HttpCode(204)
  ready(): void {}
}
