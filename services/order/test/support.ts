import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { createServer, IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CatalogSettings } from '../src/adapter/out/catalog/catalog.client';
import { AppModule } from '../src/bootstrap/app.module';
import { Config } from '../src/bootstrap/config';
import { configureApp } from '../src/bootstrap/configure-app';
import { catalogSettings } from '../src/bootstrap/wiring';
import { CatalogGateway, Clock, ExternalEventPublisher, OutboxMessage, PaymentGateway } from '../src/core/order/port/out/ports';
import { ExpireUnpaid } from '../src/core/order/usecase/expire-unpaid';
import { LifecycleHandler } from '../src/core/order/usecase/lifecycle';
import { OutboxRelay } from '../src/core/order/usecase/relay-outbox';

export const now = new Date('2026-04-28T11:00:00Z');

export const testConfig: Config = {
  httpPort: 0,
  databaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/orders_test',
  catalogUrl: '',
  paymentUrl: 'http://127.0.0.1:1',
  authMode: 'local',
  jwksUrl: '',
  jwtIssuer: '',
  jwtAudience: '',
  publisherMode: 'log',
  kafkaBrokers: [],
  kafkaGroup: 'order-test',
  kafkaTopic: 'marketplace.orders.v1',
  paymentsTopic: 'marketplace.payments.v1',
  outboxRelayIntervalMs: 0,
  expireUnpaidAfterMs: 15 * 60_000,
  expireIntervalMs: 0,
};

export function testSettings(baseUrl: string): CatalogSettings {
  return { ...catalogSettings(baseUrl), requestTimeoutMs: 300, backoffMs: 20, breakerMinRequests: 100 };
}

export class TestClock implements Clock {
  private current: Date;

  constructor(start: Date = now) {
    this.current = start;
  }

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class RecordingPublisher implements ExternalEventPublisher {
  private readonly messages: OutboxMessage[] = [];

  constructor(private readonly failure?: Error) {}

  async publish(message: OutboxMessage): Promise<void> {
    if (this.failure) throw this.failure;
    this.messages.push(message);
  }

  published(): OutboxMessage[] {
    return [...this.messages];
  }
}

type Method = 'get' | 'post';

export type OutboxRow = {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: string;
  published: boolean;
};

export type Stand = {
  app: INestApplication;
  db: DataSource;
  relay: OutboxRelay;
  lifecycle: LifecycleHandler;
  expirer: ExpireUnpaid;
  call(method: Method, path: string, token: string, body?: unknown): request.Test;
  postOrder(token: string, body?: unknown, idempotencyKey?: string): request.Test;
  postJson(path: string, token: string, body?: unknown): request.Test;
  clearTables(): Promise<void>;
  ordersInDb(): Promise<number>;
  outboxRows(): Promise<OutboxRow[]>;
  eventTypes(): Promise<string[]>;
  countEvents(eventType: string): Promise<number>;
  givenOutboxRow(eventType: string, payload: string, occurredAt?: Date): Promise<string>;
  close(): Promise<void>;
};

export type StandDeps = {
  clock?: Clock;
  payment?: PaymentGateway;
};

export async function stand(catalog: CatalogGateway, publisher: ExternalEventPublisher = new RecordingPublisher(), deps: StandDeps = {}): Promise<Stand> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forConfig(testConfig, { clock: deps.clock ?? { now: () => now }, catalog, publisher, payment: deps.payment })],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  const db = app.get(DataSource);
  const call: Stand['call'] = (method, path, token, body) => {
    let req = request(app.getHttpServer())[method](path);
    if (token !== '') req = req.set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.set('Content-Type', 'application/json').send(body as object);
  };
  const outboxRows = async (): Promise<OutboxRow[]> => {
    const rows: { id: string; aggregate_id: string; event_type: string; payload: string; published: boolean }[] = await db.query(
      'SELECT id, aggregate_id, event_type, payload::text AS payload, published_at IS NOT NULL AS published FROM outbox ORDER BY occurred_at, id',
    );
    return rows.map((row) => ({ id: row.id, aggregateId: row.aggregate_id, eventType: row.event_type, payload: row.payload, published: row.published }));
  };
  const eventTypes = async (): Promise<string[]> => (await outboxRows()).map((row) => row.eventType);
  return {
    app,
    db,
    relay: app.get(OutboxRelay),
    lifecycle: app.get(LifecycleHandler),
    expirer: app.get(ExpireUnpaid),
    call,
    postOrder: (token, body, idempotencyKey = randomUUID()) => call('post', '/api/v1/orders', token, body).set('Idempotency-Key', idempotencyKey),
    postJson: (path, token, body = {}) => call('post', path, token, body),
    clearTables: async () => {
      await db.query('TRUNCATE processed_events, outbox, idempotency_keys, order_items, orders');
    },
    ordersInDb: async () => {
      const rows: { count: string }[] = await db.query('SELECT count(*)::text AS count FROM orders');
      return Number(rows[0].count);
    },
    outboxRows,
    eventTypes,
    countEvents: async (eventType) => (await eventTypes()).filter((type) => type === eventType).length,
    givenOutboxRow: async (eventType, payload, occurredAt = now) => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO outbox (id, aggregate_id, aggregate_type, event_type, event_version, payload, occurred_at)
         VALUES ($1, $2, 'Order', $3, 1, $4::jsonb, $5)`,
        [id, randomUUID(), eventType, payload, occurredAt],
      );
      return id;
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
  await listen(server);
  return { url: urlOf(server), hits: () => hits, close: () => shutdown(server) };
}

export type RecordedRequest = {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
};

export type FakePayment = {
  url: string;
  requests(): RecordedRequest[];
  goDown(): void;
  close(): Promise<void>;
};

export async function startPayment(): Promise<FakePayment> {
  const requests: RecordedRequest[] = [];
  let down = false;
  const server: Server = createServer((req, res) => {
    requests.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers });
    if (down) {
      dropConnection(req);
      return;
    }
    const paymentId = (req.url ?? '').replace('/api/v1/payments/', '').replace('/refund', '');
    res.setHeader('Content-Type', 'application/json');
    res.end(`{"id":"${paymentId}","orderId":"${randomUUID()}","amount":100,"currency":"RUB","status":"REFUNDED"}`);
  });
  await listen(server);
  return {
    url: urlOf(server),
    requests: () => [...requests],
    goDown: () => {
      down = true;
    },
    close: () => shutdown(server),
  };
}

function listen(server: Server): Promise<void> {
  return new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function urlOf(server: Server): string {
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function shutdown(server: Server): Promise<void> {
  return new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
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
export const sellerToken = (id: string): string => `seller.${id}`;
export const adminToken = (id: string): string => `admin.${id}`;

export function orderBody(productId: string, sellerId: string, quantity: number): object {
  return {
    items: [{ productId, sellerId, quantity }],
    shippingAddress: { country: 'RU', city: 'Москва', street: 'Тверская, 1', postalCode: '125009' },
  };
}
