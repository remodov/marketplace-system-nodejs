import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CatalogSettings } from '../src/adapter/out/catalog/catalog.client';
import { AppModule } from '../src/bootstrap/app.module';
import { Config } from '../src/bootstrap/config';
import { configureApp } from '../src/bootstrap/configure-app';
import { catalogSettings } from '../src/bootstrap/wiring';
import { CatalogGateway } from '../src/core/order/port/out/ports';

export const now = new Date('2026-04-28T11:00:00Z');

export const testConfig: Config = {
  httpPort: 0,
  databaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/orders_test',
  catalogUrl: '',
  authMode: 'local',
  jwksUrl: '',
  jwtIssuer: '',
  jwtAudience: '',
};

export function testSettings(baseUrl: string): CatalogSettings {
  return { ...catalogSettings(baseUrl), requestTimeoutMs: 300, backoffMs: 20, breakerMinRequests: 100 };
}

type Method = 'get' | 'post';

export type Stand = {
  app: INestApplication;
  db: DataSource;
  call(method: Method, path: string, token: string, body?: unknown): request.Test;
  postOrder(token: string, body?: unknown, idempotencyKey?: string): request.Test;
  clearTables(): Promise<void>;
  ordersInDb(): Promise<number>;
  close(): Promise<void>;
};

export async function stand(catalog: CatalogGateway): Promise<Stand> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forConfig(testConfig, { clock: { now: () => now }, catalog })],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  const db = app.get(DataSource);
  const call: Stand['call'] = (method, path, token, body) => {
    let req = request(app.getHttpServer())[method](path);
    if (token !== '') req = req.set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.set('Content-Type', 'application/json').send(body as object);
  };
  return {
    app,
    db,
    call,
    postOrder: (token, body, idempotencyKey = randomUUID()) => call('post', '/api/v1/orders', token, body).set('Idempotency-Key', idempotencyKey),
    clearTables: async () => {
      await db.query('TRUNCATE idempotency_keys, order_items, orders');
    },
    ordersInDb: async () => {
      const rows: { count: string }[] = await db.query('SELECT count(*)::text AS count FROM orders');
      return Number(rows[0].count);
    },
    close: () => app.close(),
  };
}

export type Script = (hit: number, req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export type FakeCatalog = {
  url: string;
  hits(): number;
  close(): Promise<void>;
};

export async function startCatalog(script: Script): Promise<FakeCatalog> {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    hits += 1;
    void script(hits, req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    hits: () => hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export function answerPrice(req: IncomingMessage, res: ServerResponse, price: string): void {
  const id = (req.url ?? '').replace('/api/v1/products/', '');
  res.setHeader('Content-Type', 'application/json');
  res.end(`{"id":"${id}","title":"Кофемолка","price":${price},"currency":"RUB","status":"PUBLISHED"}`);
}

export function answerNotFound(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/problem+json');
  res.end('{"code":"PRODUCT_NOT_FOUND","status":404}');
}

export function holdFor(res: ServerResponse, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), ms);
    res.once('close', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export function dropConnection(req: IncomingMessage): void {
  req.socket.destroy();
}

export const customerToken = (id: string): string => `customer.${id}`;
export const adminToken = (id: string): string => `admin.${id}`;

export function orderBody(productId: string, sellerId: string, quantity: number): object {
  return {
    items: [{ productId, sellerId, quantity }],
    shippingAddress: { country: 'RU', city: 'Москва', street: 'Тверская, 1', postalCode: '125009' },
  };
}
