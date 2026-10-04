import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule, configureApp } from '../src/app.module';
import { Config } from '../src/config';
import { REDIS } from '../src/ratelimit/redis';

export const now = new Date('2026-04-28T11:00:00Z');
export const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://localhost:6382/1';

export type Stub = {
  url: string;
  calls(): number;
  failWith(status: number): void;
  close(): Promise<void>;
};

async function stub(body: string): Promise<Stub> {
  let calls = 0;
  let failure: number | undefined;
  const server: Server = createServer((_, res) => {
    calls += 1;
    if (failure !== undefined) {
      res.writeHead(failure).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls: () => calls,
    failWith: (status) => {
      failure = status;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export type Neighbours = {
  orderId: string;
  productId: string;
  paymentId: string;
  order: Stub;
  catalog: Stub;
  payment: Stub;
  close(): Promise<void>;
};

export async function neighbours(): Promise<Neighbours> {
  const orderId = randomUUID();
  const productId = randomUUID();
  const paymentId = randomUUID();
  const [order, catalog, payment] = await Promise.all([
    stub(JSON.stringify({ id: orderId, status: 'PAID', total: 3980, paymentId, items: [{ productId, quantity: 2 }] })),
    stub(JSON.stringify({ id: productId, title: 'Беспроводная мышь', price: 1990, currency: 'RUB' })),
    stub(JSON.stringify({ id: paymentId, status: 'CAPTURED' })),
  ]);
  return {
    orderId,
    productId,
    paymentId,
    order,
    catalog,
    payment,
    close: async () => {
      await Promise.all([order.close(), catalog.close(), payment.close()]);
    },
  };
}

export type Stand = {
  app: INestApplication;
  get(path: string, client?: string): request.Test;
  close(): Promise<void>;
};

export async function stand(n: Neighbours, requestsPerMinute = 60): Promise<Stand> {
  const config: Config = {
    httpPort: 0,
    redisUrl,
    orderUrl: n.order.url,
    catalogUrl: n.catalog.url,
    paymentUrl: n.payment.url,
    requestsPerMinute,
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forConfig(config, { clock: { now: () => now } })] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  await app
    .get<Redis>(REDIS)
    .ping()
    .catch((error: unknown) => {
      throw new Error('Redis недоступен: подними стенд командой docker compose -f infra/compose.yaml up -d redis', { cause: error });
    });
  return {
    app,
    get: (path, client = randomUUID()) =>
      request(app.getHttpServer()).get(path).set('X-Client-Id', client).set('Authorization', `Bearer customer.${randomUUID()}`),
    close: () => app.close(),
  };
}
