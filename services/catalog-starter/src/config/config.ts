export type CacheKind = 'memory' | 'redis';

export type Config = {
  httpPort: number;
  databaseUrl: string;
  cacheKind: CacheKind;
  redisUrl: string;
  cacheTtlSeconds: number;
  serviceName: string;
  otlpEndpoint: string;
  traceSampleRatio: number;
};

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    httpPort: Number(env.HTTP_PORT ?? 3082),
    databaseUrl: env.DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/catalog_starter',
    cacheKind: env.CACHE === 'memory' ? 'memory' : 'redis',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6382',
    cacheTtlSeconds: Number(env.CACHE_TTL_SECONDS ?? 600),
    serviceName: env.SERVICE_NAME ?? 'catalog-starter',
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
    traceSampleRatio: ratioOf(env.TRACE_SAMPLE_RATIO ?? '1.0'),
  };
}

function ratioOf(raw: string): number {
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 1) return 1.0;
  return value;
}
