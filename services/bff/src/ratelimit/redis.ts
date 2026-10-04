import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

export function connectRedis(url: string): Redis {
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  const log = new Logger('redis');
  client.on('error', (error: Error) => log.warn(`Redis недоступен: ${error.message}`));
  return client;
}
