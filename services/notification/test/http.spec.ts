import { EVENT_ORDER_CREATED } from '@marketplace/contracts-orders-v1';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule, configureApp } from '../src/app.module';
import { InboxProcessor } from '../src/inbox/inbox';
import { clearTables, fixedClock, orderCreated, testConfig } from './support';

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forConfig(testConfig, { clock: fixedClock })] }).compile();
  app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  await clearTables(app.get(DataSource));
});

afterAll(() => app.close());

test('пробы отвечают, миграции накатаны', async () => {
  await request(app.getHttpServer()).get('/health/live').expect(204);
  await request(app.getHttpServer()).get('/health/ready').expect(204);
});

test('список уведомлений отдаётся только администратору по токену', async () => {
  const response = await request(app.getHttpServer()).get(`/api/v1/notifications?userId=${randomUUID()}`).set('Authorization', 'Bearer customer').expect(403);

  expect(response.body.code).toBe('ACCESS_DENIED');
  expect(response.headers['content-type']).toContain('application/problem+json');
});

test('userId не UUID это 400 VALIDATION_ERROR', async () => {
  const response = await request(app.getHttpServer()).get('/api/v1/notifications?userId=abc').set('Authorization', 'Bearer admin-test').expect(400);

  expect(response.body.code).toBe('VALIDATION_ERROR');
});

test('администратор видит уведомления покупателя', async () => {
  const customer = randomUUID();
  await app.get(InboxProcessor).process({ id: randomUUID(), type: EVENT_ORDER_CREATED, payload: orderCreated(customer, randomUUID(), randomUUID()) });

  const response = await request(app.getHttpServer()).get(`/api/v1/notifications?userId=${customer}`).set('Authorization', 'Bearer admin-test').expect(200);

  expect(response.body.items).toHaveLength(1);
  expect(response.body.items[0].userId).toBe(customer);
  expect(response.body.items[0].templateKey).toBe('order-created');
});
