import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from '../adapter/in/http/health.controller';
import { OrderController } from '../adapter/in/http/order.controller';
import { PaymentEventsConsumer } from '../adapter/in/kafka/payment-events.consumer';
import { CatalogClient } from '../adapter/out/catalog/catalog.client';
import { KafkaPublisher } from '../adapter/out/kafka/kafka.publisher';
import { PaymentClient } from '../adapter/out/payment/payment.client';
import { dataSourceOptions } from '../adapter/out/persistence/datasource';
import { CatalogGateway, ExternalEventPublisher, PaymentGateway } from '../core/order/port/out/ports';
import { ExpireUnpaid } from '../core/order/usecase/expire-unpaid';
import { OutboxRelay } from '../core/order/usecase/relay-outbox';
import { Config, fromEnv } from './config';
import { CATALOG_GATEWAY, Deps, EVENT_PUBLISHER, PAYMENT_GATEWAY, wiring } from './wiring';

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(CATALOG_GATEWAY) private readonly catalog: CatalogGateway,
    @Inject(PAYMENT_GATEWAY) private readonly payment: PaymentGateway,
    @Inject(EVENT_PUBLISHER) private readonly publisher: ExternalEventPublisher,
    private readonly relay: OutboxRelay,
    private readonly expirer: ExpireUnpaid,
    private readonly paymentEvents: PaymentEventsConsumer,
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
    await this.paymentEvents.stop();
    await this.expirer.stop();
    await this.relay.stop();
    if (this.publisher instanceof KafkaPublisher) await this.publisher.close();
    if (this.catalog instanceof CatalogClient) await this.catalog.close();
    if (this.payment instanceof PaymentClient) await this.payment.close();
  }
}
