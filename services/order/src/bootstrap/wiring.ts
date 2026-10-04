import { Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AUTHENTICATOR, Authenticator, JwtAuthenticator, LocalTokens } from '../adapter/in/http/auth';
import { BearerAuthGuard } from '../adapter/in/http/auth.guard';
import { DB_PINGER, Pinger } from '../adapter/in/http/health.controller';
import { CatalogClient, CatalogSettings } from '../adapter/out/catalog/catalog.client';
import { KafkaPublisher } from '../adapter/out/kafka/kafka.publisher';
import { TypeOrmIdempotencyKeys } from '../adapter/out/persistence/idempotency.repository';
import { TypeOrmOrderRepository } from '../adapter/out/persistence/order.repository';
import { TypeOrmUnitOfWork } from '../adapter/out/persistence/unit-of-work';
import { LogPublisher } from '../adapter/out/system/log.publisher';
import { NestRelayLog } from '../adapter/out/system/relay.log';
import { RandomIds, SystemClock } from '../adapter/out/system/system';
import {
  CatalogGateway,
  Clock,
  ExternalEventPublisher,
  IdempotencyKeys,
  IdGenerator,
  OrderRepository,
  UnitOfWork,
} from '../core/order/port/out/ports';
import { QueryHandler } from '../core/order/query/queries';
import { CreateOrderHandler } from '../core/order/usecase/create-order';
import { OutboxRelay } from '../core/order/usecase/relay-outbox';
import { Config } from './config';

export const CONFIG = Symbol('CONFIG');
export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');
export const CATALOG_GATEWAY = Symbol('CATALOG_GATEWAY');
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export const IDEMPOTENCY_KEYS = Symbol('IDEMPOTENCY_KEYS');
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

const OUTBOX_BATCH_SIZE = 100;

export type Deps = {
  clock?: Clock;
  ids?: IdGenerator;
  auth?: Authenticator;
  catalog?: CatalogGateway;
  publisher?: ExternalEventPublisher;
};

export function catalogSettings(baseUrl: string): CatalogSettings {
  return {
    baseUrl,
    connectTimeoutMs: 500,
    requestTimeoutMs: 1000,
    attempts: 2,
    backoffMs: 50,
    breakerMinRequests: 10,
    breakerOpenForMs: 60_000,
  };
}

export function authenticatorOf(config: Config): Authenticator {
  if (config.authMode === 'jwt') return new JwtAuthenticator(config.jwksUrl, config.jwtIssuer, config.jwtAudience);
  return new LocalTokens();
}

export function publisherOf(config: Config): ExternalEventPublisher {
  if (config.publisherMode === 'kafka' && config.kafkaBrokers.length > 0) return new KafkaPublisher(config.kafkaBrokers, config.kafkaTopic);
  return new LogPublisher();
}

export function wiring(config: Config, deps: Deps): Provider[] {
  return [
    { provide: CONFIG, useValue: config },
    { provide: CLOCK, useValue: deps.clock ?? new SystemClock() },
    { provide: ID_GENERATOR, useValue: deps.ids ?? new RandomIds() },
    { provide: AUTHENTICATOR, useValue: deps.auth ?? authenticatorOf(config) },
    { provide: APP_GUARD, useClass: BearerAuthGuard },
    { provide: CATALOG_GATEWAY, useValue: deps.catalog ?? new CatalogClient(catalogSettings(config.catalogUrl)) },
    { provide: EVENT_PUBLISHER, useValue: deps.publisher ?? publisherOf(config) },

    { provide: DB_PINGER, useFactory: (db: DataSource): Pinger => ({ ping: () => db.query('SELECT 1') }), inject: [DataSource] },
    { provide: ORDER_REPOSITORY, useFactory: (db: DataSource) => new TypeOrmOrderRepository(db.manager), inject: [DataSource] },
    { provide: IDEMPOTENCY_KEYS, useFactory: (db: DataSource) => new TypeOrmIdempotencyKeys(db.manager), inject: [DataSource] },
    { provide: UNIT_OF_WORK, useFactory: (db: DataSource, ids: IdGenerator) => new TypeOrmUnitOfWork(db, ids), inject: [DataSource, ID_GENERATOR] },

    {
      provide: CreateOrderHandler,
      useFactory: (orders: OrderRepository, catalog: CatalogGateway, keys: IdempotencyKeys, clock: Clock, ids: IdGenerator, uow: UnitOfWork) =>
        new CreateOrderHandler(orders, catalog, keys, clock, ids, uow),
      inject: [ORDER_REPOSITORY, CATALOG_GATEWAY, IDEMPOTENCY_KEYS, CLOCK, ID_GENERATOR, UNIT_OF_WORK],
    },
    { provide: QueryHandler, useFactory: (orders: OrderRepository) => new QueryHandler(orders), inject: [ORDER_REPOSITORY] },
    {
      provide: OutboxRelay,
      useFactory: (publisher: ExternalEventPublisher, clock: Clock, uow: UnitOfWork) =>
        new OutboxRelay(publisher, clock, uow, OUTBOX_BATCH_SIZE, new NestRelayLog()),
      inject: [EVENT_PUBLISHER, CLOCK, UNIT_OF_WORK],
    },
  ];
}
