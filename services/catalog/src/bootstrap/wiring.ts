import { Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AUTHENTICATOR, Authenticator, JwtAuthenticator, LocalTokens } from '../adapter/in/http/auth';
import { BearerAuthGuard } from '../adapter/in/http/auth.guard';
import { DB_PINGER, Pinger } from '../adapter/in/http/health.controller';
import { TypeOrmAuditLogger } from '../adapter/out/persistence/audit.repository';
import { TypeOrmProductRepository } from '../adapter/out/persistence/product.repository';
import { TypeOrmUnitOfWork } from '../adapter/out/persistence/unit-of-work';
import { S3ImageStorage } from '../adapter/out/storage/s3-image-storage';
import { RandomIds, SystemClock } from '../adapter/out/system/system';
import { Clock, IdGenerator, ImageStorage, ProductRepository, UnitOfWork } from '../core/product/port/out/ports';
import { QueryHandler } from '../core/product/query/queries';
import { ChangeProductPriceHandler } from '../core/product/usecase/change-product-price';
import { ChangeStatusHandler } from '../core/product/usecase/change-status';
import { CreateProductHandler } from '../core/product/usecase/create-product';
import { RequestImageUploadHandler } from '../core/product/usecase/request-image-upload';
import { Config } from './config';

export const CONFIG = Symbol('CONFIG');
export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');
export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
export const AUDIT_LOGGER = Symbol('AUDIT_LOGGER');
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

export type Deps = {
  clock?: Clock;
  ids?: IdGenerator;
  auth?: Authenticator;
  images?: ImageStorage;
};

export function authenticatorOf(config: Config): Authenticator {
  if (config.authMode === 'jwt') return new JwtAuthenticator(config.jwksUrl, config.jwtIssuer, config.jwtAudience);
  return new LocalTokens();
}

export function imageStorageOf(config: Config, clock: Clock): ImageStorage {
  return new S3ImageStorage(
    {
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      bucket: config.s3Bucket,
      uploadUrlTtlSeconds: config.imageUploadUrlTtlSeconds,
    },
    clock,
  );
}

export function wiring(config: Config, deps: Deps): Provider[] {
  const clock = deps.clock ?? new SystemClock();
  return [
    { provide: CONFIG, useValue: config },
    { provide: CLOCK, useValue: clock },
    { provide: ID_GENERATOR, useValue: deps.ids ?? new RandomIds() },
    { provide: AUTHENTICATOR, useValue: deps.auth ?? authenticatorOf(config) },
    { provide: IMAGE_STORAGE, useValue: deps.images ?? imageStorageOf(config, clock) },
    { provide: APP_GUARD, useClass: BearerAuthGuard },

    { provide: DB_PINGER, useFactory: (db: DataSource): Pinger => ({ ping: () => db.query('SELECT 1') }), inject: [DataSource] },
    { provide: PRODUCT_REPOSITORY, useFactory: (db: DataSource) => new TypeOrmProductRepository(db.manager), inject: [DataSource] },
    { provide: AUDIT_LOGGER, useFactory: (db: DataSource) => new TypeOrmAuditLogger(db.manager), inject: [DataSource] },
    { provide: UNIT_OF_WORK, useFactory: (db: DataSource) => new TypeOrmUnitOfWork(db), inject: [DataSource] },

    {
      provide: CreateProductHandler,
      useFactory: (products: ProductRepository, clock: Clock, ids: IdGenerator) => new CreateProductHandler(products, clock, ids),
      inject: [PRODUCT_REPOSITORY, CLOCK, ID_GENERATOR],
    },
    {
      provide: ChangeProductPriceHandler,
      useFactory: (clock: Clock, ids: IdGenerator, uow: UnitOfWork) => new ChangeProductPriceHandler(clock, ids, uow),
      inject: [CLOCK, ID_GENERATOR, UNIT_OF_WORK],
    },
    {
      provide: ChangeStatusHandler,
      useFactory: (clock: Clock, ids: IdGenerator, uow: UnitOfWork) => new ChangeStatusHandler(clock, ids, uow),
      inject: [CLOCK, ID_GENERATOR, UNIT_OF_WORK],
    },
    { provide: QueryHandler, useFactory: (products: ProductRepository) => new QueryHandler(products), inject: [PRODUCT_REPOSITORY] },
    {
      provide: RequestImageUploadHandler,
      useFactory: (products: ProductRepository, images: ImageStorage, ids: IdGenerator) => new RequestImageUploadHandler(products, images, ids),
      inject: [PRODUCT_REPOSITORY, IMAGE_STORAGE, ID_GENERATOR],
    },
  ];
}

