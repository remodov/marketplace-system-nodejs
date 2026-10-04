import { DataSourceOptions } from 'typeorm';
import { Product } from '../product/product.entity';
import { migrations } from '../migrations';

export function dataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [Product],
    migrations,
    migrationsRun: true,
    synchronize: false,
    logging: process.env.SQL_LOG === '1' ? ['query'] : false,
  };
}
