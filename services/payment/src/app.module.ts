import { INestApplication, Inject, Module, OnApplicationShutdown, Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { Config, fromEnv } from './config';
import { HealthController } from './httpapi/health.controller';
import { ProblemFilter, validationPipe } from './httpapi/problem';
import { PaymentController } from './payment/payment.controller';
import { Clock, PaymentService } from './payment/payment.service';
import { connectAndEnsureSchema, POOL } from './payment/pool';

export const CLOCK = Symbol('CLOCK');

export type Deps = {
  clock?: Clock;
};

export function wiring(config: Config, deps: Deps): Provider[] {
  return [
    { provide: CLOCK, useValue: deps.clock ?? { now: () => new Date() } },
    { provide: POOL, useFactory: () => connectAndEnsureSchema(config.databaseUrl) },
    { provide: PaymentService, useFactory: (pool: Pool, clock: Clock) => new PaymentService(pool, clock), inject: [POOL, CLOCK] },
  ];
}

export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ProblemFilter());
  app.getHttpAdapter().getInstance().set('json spaces', 0);
  return app;
}

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  static forConfig(config: Config = fromEnv(), deps: Deps = {}) {
    return {
      module: AppModule,
      controllers: [HealthController, PaymentController],
      providers: wiring(config, deps),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
