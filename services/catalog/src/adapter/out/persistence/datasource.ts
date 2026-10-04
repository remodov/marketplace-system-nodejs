import { DataSourceOptions } from 'typeorm';
import { migrations } from './migrations';
import { AuditLogRow, ProductRow } from './rows';

export function dataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [ProductRow, AuditLogRow],
    migrations,
    migrationsRun: true,
    synchronize: false,
    logging: process.env.SQL_LOG === '1' ? ['query'] : false,
  };
}
