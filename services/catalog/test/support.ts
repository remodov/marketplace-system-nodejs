import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/bootstrap/app.module';
import { Config } from '../src/bootstrap/config';
import { configureApp } from '../src/bootstrap/configure-app';

export const now = new Date('2026-04-28T11:00:00Z');

export const testConfig: Config = {
  httpPort: 0,
  databaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/catalog_test',
  authMode: 'local',
  jwksUrl: '',
  jwtIssuer: '',
  jwtAudience: '',
  s3Endpoint: 'http://localhost:9002',
  s3Region: 'us-east-1',
  s3AccessKey: 'marketplace',
  s3SecretKey: 'marketplace',
  s3Bucket: 'marketplace-images',
  imageUploadUrlTtlSeconds: 600,
};

type Method = 'get' | 'post' | 'patch';

export type Stand = {
  app: INestApplication;
  db: DataSource;
  call(method: Method, path: string, token: string, body?: unknown): request.Test;
  clearTables(): Promise<void>;
  givenProduct(sellerId: string, status: string, price: string): Promise<string>;
  priceInDb(id: string): Promise<string>;
  auditActions(): Promise<string[]>;
  close(): Promise<void>;
};

export async function stand(): Promise<Stand> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forConfig(testConfig, { clock: { now: () => now } })],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  const db = app.get(DataSource);
  return {
    app,
    db,
    call: (method, path, token, body) => {
      let req = request(app.getHttpServer())[method](path);
      if (token !== '') req = req.set('Authorization', `Bearer ${token}`);
      return body === undefined ? req : req.set('Content-Type', 'application/json').send(body as object);
    },
    clearTables: async () => {
      await db.query('TRUNCATE catalog_audit_log, products');
    },
    givenProduct: async (sellerId, status, price) => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO products (id, title, description, price, currency, seller_id, status, created_at, updated_at)
         VALUES ($1, 'Ноутбук', 'Тестовый товар', $2::numeric, 'RUB', $3, $4::product_status, $5, $5)`,
        [id, price, sellerId, status, now],
      );
      return id;
    },
    priceInDb: async (id) => {
      const rows: { price: string }[] = await db.query('SELECT price::text AS price FROM products WHERE id = $1', [id]);
      if (rows.length === 0) throw new Error(`товара ${id} нет в базе`);
      return rows[0].price;
    },
    auditActions: async () => {
      const rows: { action: string }[] = await db.query('SELECT action FROM catalog_audit_log ORDER BY occurred_at');
      return rows.map((row) => row.action);
    },
    close: () => app.close(),
  };
}

export const sellerToken = (id: string): string => `seller.${id}`;
export const adminToken = (id: string): string => `admin.${id}`;
export const customerToken = (id: string): string => `customer.${id}`;
