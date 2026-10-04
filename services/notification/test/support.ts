import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Config } from '../src/config';
import { dataSourceOptions } from '../src/persistence/datasource';

export const now = new Date('2026-04-28T11:00:00Z');
export const fixedClock = { now: () => now };

export const testConfig: Config = {
  httpPort: 0,
  databaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/notifications_test',
  kafkaBrokers: [],
  kafkaGroup: 'notification-test',
  kafkaTopic: 'marketplace.orders.v1',
  adminToken: 'admin-test',
};

export async function testDatabase(): Promise<DataSource> {
  try {
    return await new DataSource(dataSourceOptions(testConfig.databaseUrl)).initialize();
  } catch (error) {
    throw new Error(`тестовая база недоступна: подними стенд командой docker compose -f infra/compose.yaml up -d postgres-catalog-starter`, { cause: error });
  }
}

export async function clearTables(db: DataSource): Promise<void> {
  await db.query('TRUNCATE notifications, processed_events');
}

export function orderCreated(customerId: string, sellerId: string, orderId: string): string {
  return JSON.stringify({
    orderId,
    customerId,
    sellerId,
    occurredAt: now.toISOString(),
    totalAmount: '4981.00',
    currency: 'RUB',
    itemsCount: 1,
  });
}
