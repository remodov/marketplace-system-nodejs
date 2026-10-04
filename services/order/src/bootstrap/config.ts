import { TOPIC } from '@marketplace/contracts-orders-v1';

export type AuthMode = 'local' | 'jwt';
export type PublisherMode = 'kafka' | 'log';

export type Config = {
  httpPort: number;
  databaseUrl: string;
  catalogUrl: string;
  authMode: AuthMode;
  jwksUrl: string;
  jwtIssuer: string;
  jwtAudience: string;
  publisherMode: PublisherMode;
  kafkaBrokers: string[];
  kafkaTopic: string;
  outboxRelayIntervalMs: number;
};

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    httpPort: Number(env.HTTP_PORT ?? 3081),
    databaseUrl: env.DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/orders',
    catalogUrl: env.CATALOG_URL ?? 'http://localhost:3080',
    authMode: env.AUTH_MODE === 'jwt' ? 'jwt' : 'local',
    jwksUrl: env.JWKS_URL ?? 'http://localhost:8180/realms/marketplace/protocol/openid-connect/certs',
    jwtIssuer: env.JWT_ISSUER ?? 'http://localhost:8180/realms/marketplace',
    jwtAudience: env.JWT_AUDIENCE ?? '',
    publisherMode: env.EVENT_PUBLISHER === 'log' ? 'log' : 'kafka',
    kafkaBrokers: brokersOf(env.KAFKA_BROKERS ?? 'localhost:9095'),
    kafkaTopic: env.KAFKA_TOPIC ?? TOPIC,
    outboxRelayIntervalMs: Number(env.OUTBOX_RELAY_INTERVAL_MS ?? 1000),
  };
}

export function brokersOf(raw: string): string[] {
  return raw
    .split(',')
    .map((broker) => broker.trim())
    .filter((broker) => broker !== '');
}
