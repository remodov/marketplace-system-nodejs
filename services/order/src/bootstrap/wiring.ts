import { Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AUTHENTICATOR, Authenticator, JwtAuthenticator, LocalTokens } from '../adapter/in/http/auth';
import { BearerAuthGuard } from '../adapter/in/http/auth.guard';
import { DB_PINGER, Pinger } from '../adapter/in/http/health.controller';
import { CatalogClient, CatalogSettings } from '../adapter/out/catalog/catalog.client';
import { TypeOrmOrderRepository } from '../adapter/out/persistence/order.repository';
import { TypeOrmUnitOfWork } from '../adapter/out/persistence/unit-of-work';
import { RandomIds, SystemClock } from '../adapter/out/system/system';
import { CatalogGateway, Clock, IdGenerator, OrderRepository, UnitOfWork } from '../core/order/port/out/ports';
import { QueryHandler } from '../core/order/query/queries';
import { CreateOrderHandler } from '../core/order/usecase/create-order';
import { Config } from './config';

export const CONFIG = Symbol('CONFIG');
export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');
export const CATALOG_GATEWAY = Symbol('CATALOG_GATEWAY');
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export type Deps = {
  clock?: Clock;
  ids?: IdGenerator;
  auth?: Authenticator;
  catalog?: CatalogGateway;
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

export function wiring(config: Config, deps: Deps): Provider[] {
  return [
    { provide: CONFIG, useValue: config },
    { provide: CLOCK, useValue: deps.clock ?? new SystemClock() },
    { provide: ID_GENERATOR, useValue: deps.ids ?? new RandomIds() },
    { provide: AUTHENTICATOR, useValue: deps.auth ?? authenticatorOf(config) },
    { provide: APP_GUARD, useClass: BearerAuthGuard },
    { provide: CATALOG_GATEWAY, useValue: deps.catalog ?? new CatalogClient(catalogSettings(config.catalogUrl)) },

    { provide: DB_PINGER, useFactory: (db: DataSource): Pinger => ({ ping: () => db.query('SELECT 1') }), inject: [DataSource] },
    { provide: ORDER_REPOSITORY, useFactory: (db: DataSource) => new TypeOrmOrderRepository(db.manager), inject: [DataSource] },
    { provide: UNIT_OF_WORK, useFactory: (db: DataSource) => new TypeOrmUnitOfWork(db), inject: [DataSource] },

    {
      provide: CreateOrderHandler,
      useFactory: (catalog: CatalogGateway, clock: Clock, ids: IdGenerator, uow: UnitOfWork) => new CreateOrderHandler(catalog, clock, ids, uow),
      inject: [CATALOG_GATEWAY, CLOCK, ID_GENERATOR, UNIT_OF_WORK],
    },
    { provide: QueryHandler, useFactory: (orders: OrderRepository) => new QueryHandler(orders), inject: [ORDER_REPOSITORY] },
  ];
}
