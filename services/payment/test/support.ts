import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule, configureApp } from '../src/app.module';
import { Config } from '../src/config';
import { POOL } from '../src/payment/pool';

export const now = new Date('2026-04-28T11:00:00Z');

export const testConfig: Config = {
  httpPort: 0,
  databaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/payments_test',
};

type Method = 'get' | 'post';

export type Stand = {
  app: INestApplication;
  pool: Pool;
  call(method: Method, path: string, body?: unknown): request.Test;
  authorize(orderId: string, amount?: number): Promise<string>;
  clean(): Promise<void>;
  paymentsInDb(): Promise<number>;
  close(): Promise<void>;
};

export async function stand(): Promise<Stand> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forConfig(testConfig, { clock: { now: () => now } })] })
    .compile()
    .catch((error: unknown) => {
      throw new Error('тестовая база недоступна: подними стенд командой docker compose -f infra/compose.yaml up -d postgres-catalog-starter', { cause: error });
    });
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  const pool = app.get<Pool>(POOL);
  const call: Stand['call'] = (method, path, body) => {
    const req = request(app.getHttpServer())[method](path);
    return body === undefined ? req : req.set('Content-Type', 'application/json').send(body as object);
  };
  return {
    app,
    pool,
    call,
    authorize: async (orderId, amount = 1990) => {
      const response = await call('post', '/api/v1/payments', { orderId, amount, currency: 'RUB' }).expect(201);
      return response.body.id as string;
    },
    clean: async () => {
      await pool.query('DELETE FROM payments');
    },
    paymentsInDb: async () => {
      const result = await pool.query('SELECT count(*)::int AS count FROM payments');
      return result.rows[0].count as number;
    },
    close: () => app.close(),
  };
}
