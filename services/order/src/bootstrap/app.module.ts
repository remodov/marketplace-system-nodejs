import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from '../adapter/in/http/health.controller';
import { OrderController } from '../adapter/in/http/order.controller';
import { CatalogClient } from '../adapter/out/catalog/catalog.client';
import { KafkaPublisher } from '../adapter/out/kafka/kafka.publisher';
import { dataSourceOptions } from '../adapter/out/persistence/datasource';
import { CatalogGateway, ExternalEventPublisher } from '../core/order/port/out/ports';
import { OutboxRelay } from '../core/order/usecase/relay-outbox';
import { Config, fromEnv } from './config';
import { CATALOG_GATEWAY, Deps, EVENT_PUBLISHER, wiring } from './wiring';

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(CATALOG_GATEWAY) private readonly catalog: CatalogGateway,
    @Inject(EVENT_PUBLISHER) private readonly publisher: ExternalEventPublisher,
    private readonly relay: OutboxRelay,
  ) {}

  static forConfig(config: Config = fromEnv(), deps: Deps = {}) {
    return {
      module: AppModule,
      imports: [TypeOrmModule.forRoot(dataSourceOptions(config.databaseUrl))],
      controllers: [HealthController, OrderController],
      providers: wiring(config, deps),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.relay.stop();
    if (this.publisher instanceof KafkaPublisher) await this.publisher.close();
    if (this.catalog instanceof CatalogClient) await this.catalog.close();
  }
}
