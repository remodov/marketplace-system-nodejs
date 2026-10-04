import { randomUUID } from 'node:crypto';
import { Stand, stand } from './support';

let s: Stand;

beforeAll(async () => {
  s = await stand();
});

beforeEach(() => s.clean());

afterAll(() => s.close());

test('авторизация создаёт платёж в AUTHORIZED', async () => {
  const orderId = randomUUID();
  const id = await s.authorize(orderId);

  const response = await s.call('get', `/api/v1/payments/${id}`).expect(200);

  expect(response.body.status).toBe('AUTHORIZED');
  expect(response.body.orderId).toBe(orderId);
  expect(response.body.amount).toBe(1990);
  expect(response.body.currency).toBe('RUB');
});

test('повторная авторизация того же заказа возвращает прежний платёж', async () => {
  const orderId = randomUUID();

  const first = await s.authorize(orderId);
  const second = await s.authorize(orderId);

  expect(second).toBe(first);
  expect(await s.paymentsInDb()).toBe(1);
});

test('списание переводит платёж в CAPTURED', async () => {
  const id = await s.authorize(randomUUID());

  const response = await s.call('post', `/api/v1/payments/${id}/capture`).expect(200);

  expect(response.body.status).toBe('CAPTURED');
});

test('возврат после списания разрешён', async () => {
  const id = await s.authorize(randomUUID());
  await s.call('post', `/api/v1/payments/${id}/capture`).expect(200);

  const response = await s.call('post', `/api/v1/payments/${id}/refund`).expect(200);

  expect(response.body.status).toBe('REFUNDED');
});

test('повторный возврат безопасен: тот же ответ, а не второй возврат', async () => {
  const id = await s.authorize(randomUUID());
  const first = await s.call('post', `/api/v1/payments/${id}/refund`).expect(200);

  const second = await s.call('post', `/api/v1/payments/${id}/refund`).expect(200);

  expect(second.body.status).toBe('REFUNDED');
  expect(second.body).toEqual(first.body);
});

test('списание после возврата отклоняется, данные целы', async () => {
  const id = await s.authorize(randomUUID());
  await s.call('post', `/api/v1/payments/${id}/refund`).expect(200);

  const rejected = await s.call('post', `/api/v1/payments/${id}/capture`).expect(409);

  expect(rejected.body.code).toBe('INVALID_PAYMENT_TRANSITION');
  expect(rejected.headers['content-type']).toContain('application/problem+json');
  const current = await s.call('get', `/api/v1/payments/${id}`).expect(200);
  expect(current.body.status).toBe('REFUNDED');
});

test('неизвестный платёж это 404 PAYMENT_NOT_FOUND', async () => {
  const response = await s.call('get', `/api/v1/payments/${randomUUID()}`).expect(404);

  expect(response.body.code).toBe('PAYMENT_NOT_FOUND');
});

test('нулевая сумма и неполное тело отклоняются до базы', async () => {
  const zero = await s.call('post', '/api/v1/payments', { orderId: randomUUID(), amount: 0, currency: 'RUB' }).expect(400);
  expect(zero.body.code).toBe('VALIDATION_ERROR');
  expect(zero.body.errors.amount).toBeDefined();

  const incomplete = await s.call('post', '/api/v1/payments', { orderId: 'не uuid', currency: 'RU' }).expect(400);
  expect(incomplete.body.errors.orderId).toBeDefined();
  expect(incomplete.body.errors.currency).toBeDefined();

  expect(await s.paymentsInDb()).toBe(0);
});
