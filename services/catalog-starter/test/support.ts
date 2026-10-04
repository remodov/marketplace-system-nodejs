import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { Config } from '../src/config/config';
import { Product } from '../src/product/product.entity';
import { ProductService } from '../src/product/product.service';

export const testConfig: Config = {
  httpPort: 0,
  databaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/catalog_starter_test',
  cacheKind: 'memory',
  redisUrl: 'redis://localhost:6382',
  cacheTtlSeconds: 600,
};

export type Stand = {
  app: INestApplication;
  service: ProductService;
  call(method: 'get' | 'post' | 'patch', path: string, body?: unknown): request.Test;
  mustCreate(title: string, price: string, stock: number): Promise<Product>;
  close(): Promise<void>;
};

export async function stand(): Promise<Stand> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forConfig(testConfig)] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  const service = app.get(ProductService);
  return {
    app,
    service,
    call: (method, path, body) => {
      const req = request(app.getHttpServer())[method](path);
      return body === undefined ? req : req.set("Content-Type", "application/json").send(body as object);
    },
    mustCreate: (title, price, stock) => service.create(title, new Decimal(price), stock),
    close: () => app.close(),
  };
}

export function unique(title: string): string {
  return `${title} ${randomUUID().slice(0, 8)}`;
}
