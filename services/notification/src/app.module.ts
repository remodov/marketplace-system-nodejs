import { INestApplication, Module, OnApplicationShutdown, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Config, fromEnv } from './config';
import { OrderEventsConsumer } from './consumer/order-events.consumer';
import { DB_PINGER, HealthController, Pinger } from './httpapi/health.controller';
import { CONFIG, NotificationsController } from './httpapi/notifications.controller';
import { ProblemFilter } from './httpapi/problem';
import { Clock, InboxProcessor } from './inbox/inbox';
import { dataSourceOptions } from './persistence/datasource';

export const CLOCK = Symbol('CLOCK');

export type Deps = {
  clock?: Clock;
};

export function wiring(config: Config, deps: Deps): Provider[] {
  return [
    { provide: CONFIG, useValue: config },
    { provide: CLOCK, useValue: deps.clock ?? { now: () => new Date() } },
    { provide: DB_PINGER, useFactory: (db: DataSource): Pinger => ({ ping: () => db.query('SELECT 1') }), inject: [DataSource] },
    { provide: InboxProcessor, useFactory: (db: DataSource, clock: Clock) => new InboxProcessor(db, clock), inject: [DataSource, CLOCK] },
    {
      provide: OrderEventsConsumer,
      useFactory: (processor: InboxProcessor) => new OrderEventsConsumer(config.kafkaBrokers, config.kafkaGroup, config.kafkaTopic, processor),
      inject: [InboxProcessor],
    },
  ];
}

export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalFilters(new ProblemFilter());
  app.getHttpAdapter().getInstance().set('json spaces', 0);
  return app;
}

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(private readonly consumer: OrderEventsConsumer) {}

  static forConfig(config: Config = fromEnv(), deps: Deps = {}) {
    return {
      module: AppModule,
      imports: [TypeOrmModule.forRoot(dataSourceOptions(config.databaseUrl))],
      controllers: [HealthController, NotificationsController],
      providers: wiring(config, deps),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }
}
