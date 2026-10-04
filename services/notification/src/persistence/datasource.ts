import { DataSourceOptions } from 'typeorm';
import { migrations } from '../migrations';

export function dataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [],
    migrations,
    migrationsRun: true,
    synchronize: false,
    logging: process.env.SQL_LOG === '1' ? ['query'] : false,
  };
}
