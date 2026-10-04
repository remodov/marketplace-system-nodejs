import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from '../adapter/in/http/health.controller';
import { OrderController } from '../adapter/in/http/order.controller';
import { CatalogClient } from '../adapter/out/catalog/catalog.client';
import { dataSourceOptions } from '../adapter/out/persistence/datasource';
import { CatalogGateway } from '../core/order/port/out/ports';
import { Config, fromEnv } from './config';
import { CATALOG_GATEWAY, Deps, wiring } from './wiring';

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(CATALOG_GATEWAY) private readonly catalog: CatalogGateway) {}

  static forConfig(config: Config = fromEnv(), deps: Deps = {}) {
    return {
      module: AppModule,
      imports: [TypeOrmModule.forRoot(dataSourceOptions(config.databaseUrl))],
      controllers: [HealthController, OrderController],
      providers: wiring(config, deps),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.catalog instanceof CatalogClient) await this.catalog.close();
  }
}
