import { Module } from '@nestjs/common';
import { Config } from '../config/config';
import { CONFIG } from '../config/config.module';
import { CACHE, Cache } from './cache';
import { MemoryCache } from './memory.cache';
import { RedisCache } from './redis.cache';

export function cacheOf(config: Config): Cache {
  if (config.cacheKind === 'memory') return new MemoryCache(config.cacheTtlSeconds);
  return new RedisCache(config.redisUrl, config.cacheTtlSeconds);
}

@Module({
  providers: [{ provide: CACHE, useFactory: cacheOf, inject: [CONFIG] }],
  exports: [CACHE],
})
export class CacheModule {}
