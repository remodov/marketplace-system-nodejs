import { TOPIC } from '@marketplace/contracts-orders-v1';
import { TOPIC as PAYMENTS_TOPIC } from '@marketplace/contracts-payments-v1';

export type AuthMode = 'local' | 'jwt';
export type PublisherMode = 'kafka' | 'log';

const FIFTEEN_MINUTES_MS = 15 * 60_000;
const ONE_MINUTE_MS = 60_000;

export type Config = {
  httpPort: number;
  databaseUrl: string;
  catalogUrl: string;
  paymentUrl: string;
  authMode: AuthMode;
  jwksUrl: string;
  jwtIssuer: string;
  jwtAudience: string;
  publisherMode: PublisherMode;
  kafkaBrokers: string[];
  kafkaGroup: string;
  kafkaTopic: string;
  paymentsTopic: string;
  outboxRelayIntervalMs: number;
  expireUnpaidAfterMs: number;
  expireIntervalMs: number;
};

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    httpPort: Number(env.HTTP_PORT ?? 3081),
    databaseUrl: env.DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/orders',
    catalogUrl: env.CATALOG_URL ?? 'http://localhost:3080',
    paymentUrl: env.PAYMENT_URL ?? 'http://localhost:3086',
    authMode: env.AUTH_MODE === 'jwt' ? 'jwt' : 'local',
    jwksUrl: env.JWKS_URL ?? 'http://localhost:8180/realms/marketplace/protocol/openid-connect/certs',
    jwtIssuer: env.JWT_ISSUER ?? 'http://localhost:8180/realms/marketplace',
    jwtAudience: env.JWT_AUDIENCE ?? '',
    publisherMode: env.EVENT_PUBLISHER === 'log' ? 'log' : 'kafka',
    kafkaBrokers: brokersOf(env.KAFKA_BROKERS ?? 'localhost:9095'),
    kafkaGroup: env.KAFKA_GROUP ?? 'order',
    kafkaTopic: env.KAFKA_TOPIC ?? TOPIC,
    paymentsTopic: env.PAYMENTS_TOPIC ?? PAYMENTS_TOPIC,
    outboxRelayIntervalMs: Number(env.OUTBOX_RELAY_INTERVAL_MS ?? 1000),
    expireUnpaidAfterMs: Number(env.EXPIRE_UNPAID_AFTER_MS ?? FIFTEEN_MINUTES_MS),
    expireIntervalMs: Number(env.EXPIRE_INTERVAL_MS ?? ONE_MINUTE_MS),
  };
}

export function kafkaInUse(config: Config): boolean {
  return config.publisherMode === 'kafka' && config.kafkaBrokers.length > 0;
}

export function brokersOf(raw: string): string[] {
  return raw
    .split(',')
    .map((broker) => broker.trim())
    .filter((broker) => broker !== '');
}
