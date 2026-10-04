import { randomUUID } from 'node:crypto';
import { CatalogClient } from '../src/adapter/out/catalog/catalog.client';
import { answerPrice, customerToken, FakeCatalog, orderBody, Stand, stand, startCatalog, testSettings } from './support';

let s: Stand;
let fake: FakeCatalog;

beforeEach(async () => {
  fake = await startCatalog((_, req, res) => answerPrice(req, res, '200.00'));
  s = await stand(new CatalogClient(testSettings(fake.url)));
  await s.clearTables();
});

afterEach(async () => {
  await s.close();
  await fake.close();
});

test('повтор с тем же ключом и телом возвращает прежний заказ ответом 200', async () => {
  const customer = customerToken(randomUUID());
  const key = randomUUID();
  const body = orderBody(randomUUID(), randomUUID(), 1);

  const first = await s.postOrder(customer, body, key).expect(201);
  const second = await s.postOrder(customer, body, key).expect(200);

  expect(second.body.id).toBe(first.body.id);
  expect(second.body).toEqual(first.body);
  expect(await s.ordersInDb()).toBe(1);
  expect(fake.hits()).toBe(1);
});

test('тот же ключ с другим телом даёт 409 IDEMPOTENCY_KEY_CONFLICT', async () => {
  const customer = customerToken(randomUUID());
  const key = randomUUID();
  const product = randomUUID();
  const seller = randomUUID();

  await s.postOrder(customer, orderBody(product, seller, 1), key).expect(201);
  const response = await s.postOrder(customer, orderBody(product, seller, 5), key).expect(409);

  expect(response.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(await s.ordersInDb()).toBe(1);
  expect(fake.hits()).toBe(1);
});

test('разные ключи создают разные заказы', async () => {
  const customer = customerToken(randomUUID());
  const body = orderBody(randomUUID(), randomUUID(), 1);

  const first = await s.postOrder(customer, body).expect(201);
  const second = await s.postOrder(customer, body).expect(201);

  expect(second.body.id).not.toBe(first.body.id);
  expect(await s.ordersInDb()).toBe(2);
});

test('восемь одинаковых запросов разом создают один заказ, и все получают его', async () => {
  const customer = customerToken(randomUUID());
  const key = randomUUID();
  const body = orderBody(randomUUID(), randomUUID(), 1);

  const responses = await Promise.all(Array.from({ length: 8 }, () => s.postOrder(customer, body, key)));

  expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 201]);
  expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
  expect(await s.ordersInDb()).toBe(1);
});

test('без Idempotency-Key оформление отклоняется до похода в каталог', async () => {
  const response = await s.call('post', '/api/v1/orders', customerToken(randomUUID()), orderBody(randomUUID(), randomUUID(), 1)).expect(400);

  expect(response.body.code).toBe('VALIDATION_ERROR');
  expect(response.body.errors['Idempotency-Key']).toBeDefined();
  expect(await s.ordersInDb()).toBe(0);
  expect(fake.hits()).toBe(0);
});
