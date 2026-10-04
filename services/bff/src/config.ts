export type Config = {
  httpPort: number;
  redisUrl: string;
  orderUrl: string;
  catalogUrl: string;
  paymentUrl: string;
  requestsPerMinute: number;
};

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    httpPort: Number(env.HTTP_PORT ?? 3090),
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6382',
    orderUrl: env.ORDER_URL ?? 'http://localhost:3081',
    catalogUrl: env.CATALOG_URL ?? 'http://localhost:3080',
    paymentUrl: env.PAYMENT_URL ?? 'http://localhost:3086',
    requestsPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 60),
  };
}
