import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Config, fromEnv } from './config/config';
import { ConfigModule } from './config/config.module';
import { dataSourceOptions } from './database/datasource';
import { ProductModule } from './product/product.module';

@Module({})
export class AppModule {
  static forConfig(config: Config = fromEnv()) {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), TypeOrmModule.forRoot(dataSourceOptions(config.databaseUrl)), ProductModule],
    };
  }
}
