import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseReadiness } from './readiness';

const notReady = {
  type: 'about:blank',
  title: 'Service Unavailable',
  status: 503,
  code: 'NOT_READY',
  detail: 'База недоступна',
};

@Controller('health')
export class HealthController {
  constructor(private readonly readiness: DatabaseReadiness) {}

  @Get('live')
  @HttpCode(204)
  live(): void {}

  @Get('ready')
  async ready(@Res() res: Response): Promise<void> {
    if (await this.readiness.databaseAnswers()) {
      res.status(204).send();
      return;
    }
    res.status(503).type('application/problem+json').send(notReady);
  }
}
