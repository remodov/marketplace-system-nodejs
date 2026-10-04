import { Controller, Get, HttpCode, Inject } from '@nestjs/common';

export const DB_PINGER = Symbol('DB_PINGER');

export interface Pinger {
  ping(): Promise<void>;
}

@Controller('health')
export class HealthController {
  constructor(@Inject(DB_PINGER) private readonly db: Pinger) {}

  @Get('live')
  @HttpCode(204)
  live(): void {}

  @Get('ready')
  @HttpCode(204)
  async ready(): Promise<void> {
    try {
      await this.db.ping();
    } catch {
      throw new NotReadyError();
    }
  }
}

export class NotReadyError extends Error {
  constructor() {
    super('База недоступна');
  }
}
