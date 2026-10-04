import { INestApplication, Inject, Module, OnApplicationShutdown, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { Config, fromEnv } from './config';
import { HealthController } from './httpapi/health.controller';
import { ProblemFilter } from './httpapi/problem';
import { ScreenController } from './httpapi/screen.controller';
import { Clock, Limiter } from './ratelimit/limiter';
import { RateLimitGuard } from './ratelimit/rate-limit.guard';
import { connectRedis, REDIS } from './ratelimit/redis';
import { ScreenAssembler } from './screen/screen.assembler';

export const CLOCK = Symbol('CLOCK');

export type Deps = {
  clock?: Clock;
};

export function wiring(config: Config, deps: Deps): Provider[] {
  return [
    { provide: CLOCK, useValue: deps.clock ?? { now: () => new Date() } },
    { provide: REDIS, useFactory: () => connectRedis(config.redisUrl) },
    { provide: Limiter, useFactory: (redis: Redis, clock: Clock) => new Limiter(redis, config.requestsPerMinute, clock), inject: [REDIS, CLOCK] },
    { provide: ScreenAssembler, useFactory: () => new ScreenAssembler(config) },
    RateLimitGuard,
  ];
}

export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalFilters(new ProblemFilter());
  app.getHttpAdapter().getInstance().set('json spaces', 0);
  return app;
}

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly screens: ScreenAssembler,
  ) {}

  static forConfig(config: Config = fromEnv(), deps: Deps = {}) {
    return {
      module: AppModule,
      controllers: [HealthController, ScreenController],
      providers: wiring(config, deps),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.screens.close();
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
