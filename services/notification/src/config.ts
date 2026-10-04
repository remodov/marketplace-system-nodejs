import { TOPIC } from '@marketplace/contracts-orders-v1';

export type Config = {
  httpPort: number;
  databaseUrl: string;
  kafkaBrokers: string[];
  kafkaGroup: string;
  kafkaTopic: string;
  adminToken: string;
};

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    httpPort: Number(env.HTTP_PORT ?? 3085),
    databaseUrl: env.DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/notifications',
    kafkaBrokers: brokersOf(env.KAFKA_BROKERS ?? 'localhost:9095'),
    kafkaGroup: env.KAFKA_GROUP ?? 'notification',
    kafkaTopic: env.KAFKA_TOPIC ?? TOPIC,
    adminToken: env.ADMIN_TOKEN ?? 'admin',
  };
}

export function brokersOf(raw: string): string[] {
  return raw
    .split(',')
    .map((broker) => broker.trim())
    .filter((broker) => broker !== '');
}
