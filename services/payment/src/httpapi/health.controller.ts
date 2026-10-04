import { Controller, Get, HttpCode, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { POOL } from '../payment/pool';
import { notReady } from './problem';

@Controller('health')
export class HealthController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Get('live')
  @HttpCode(204)
  live(): void {}

  @Get('ready')
  @HttpCode(204)
  async ready(): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
    } catch {
      throw notReady();
    }
  }
}
