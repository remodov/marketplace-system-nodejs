export type CacheKind = 'memory' | 'redis';

export type Config = {
  httpPort: number;
  databaseUrl: string;
  cacheKind: CacheKind;
  redisUrl: string;
  cacheTtlSeconds: number;
};

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    httpPort: Number(env.HTTP_PORT ?? 3082),
    databaseUrl: env.DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/catalog_starter',
    cacheKind: env.CACHE === 'memory' ? 'memory' : 'redis',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6382',
    cacheTtlSeconds: Number(env.CACHE_TTL_SECONDS ?? 600),
  };
}
