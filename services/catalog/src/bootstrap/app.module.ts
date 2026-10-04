import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from '../adapter/in/http/health.controller';
import { ProductController } from '../adapter/in/http/product.controller';
import { dataSourceOptions } from '../adapter/out/persistence/datasource';
import { Config, fromEnv } from './config';
import { Deps, wiring } from './wiring';

@Module({})
export class AppModule {
  static forConfig(config: Config = fromEnv(), deps: Deps = {}) {
    return {
      module: AppModule,
      imports: [TypeOrmModule.forRoot(dataSourceOptions(config.databaseUrl))],
      controllers: [HealthController, ProductController],
      providers: wiring(config, deps),
    };
  }
}
