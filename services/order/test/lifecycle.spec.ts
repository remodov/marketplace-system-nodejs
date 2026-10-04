import { HEADER_EVENT_ID, HEADER_EVENT_TYPE, OrderCancelledPayload } from '@marketplace/contracts-orders-v1';
import { EVENT_PAYMENT_COMPLETED, PaymentCompletedPayload } from '@marketplace/contracts-payments-v1';
import { KafkaMessage } from 'kafkajs';
import { randomUUID } from 'node:crypto';
import { PaymentEventHandler } from '../src/adapter/in/kafka/payment-events.consumer';
import { CatalogClient } from '../src/adapter/out/catalog/catalog.client';
import { PaymentClient } from '../src/adapter/out/payment/payment.client';
import { paymentSettings } from '../src/bootstrap/wiring';
import {
  adminToken,
  answerPrice,
  customerToken,
  FakeCatalog,
  FakePayment,
  now,
  orderBody,
  sellerToken,
  Stand,
  stand,
  startCatalog,
  startPayment,
  TestClock,
  testSettings,
} from './support';

let s: Stand;
let catalog: FakeCatalog;
let payment: FakePayment;
let clock: TestClock;
let customer: string;
let seller: string;
let orderId: string;

async function givenOrder(price: string): Promise<void> {
  catalog = await startCatalog((_, req, res) => answerPrice(req, res, price));
  payment = await startPayment();
  clock = new TestClock();
  s = await stand(new CatalogClient(testSettings(catalog.url)), undefined, { clock, payment: new PaymentClient(paymentSettings(payment.url)) });
  await s.clearTables();
  customer = randomUUID();
  seller = randomUUID();
  const created = await s.postOrder(customerToken(customer), orderBody(randomUUID(), seller, 1)).expect(201);
  orderId = created.body.id;
}

const path = (action: string): string => `/api/v1/orders/${orderId}${action}`;

async function confirmed(): Promise<void> {
  await s.postJson(path('/confirm'), customerToken(customer)).expect(200);
}

async function paid(paymentId: string): Promise<void> {
  await s.postJson(path('/pay'), adminToken(randomUUID()), { paymentId }).expect(200);
}

async function currentStatus(): Promise<string> {
  const response = await s.call('get', path(''), customerToken(customer)).expect(200);
  return response.body.status;
}

afterEach(async () => {
  await s.close();
  await catalog.close();
  await payment.close();
});

test('полный путь: черновик, ожидание оплаты, оплата, отправка, получение', async () => {
  await givenOrder('200.00');
  const paymentId = randomUUID();

  const confirm = await s.postJson(path('/confirm'), customerToken(customer)).expect(200);
  const pay = await s.postJson(path('/pay'), adminToken(randomUUID()), { paymentId }).expect(200);
  const ship = await s.postJson(path('/ship'), sellerToken(seller), { trackingNumber: 'TRACK-12345' }).expect(200);
  const deliver = await s.postJson(path('/deliver'), customerToken(customer)).expect(200);

  expect([confirm.body.status, pay.body.status, ship.body.status, deliver.body.status]).toEqual(['PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED']);
  expect(pay.body.paymentId).toBe(paymentId);
  expect(pay.body.paidAt).toBe(now.toISOString());
  expect(ship.body.shippedAt).toBeDefined();
  expect(deliver.body.deliveredAt).toBeDefined();
  expect((await s.eventTypes()).sort()).toEqual(['OrderConfirmed', 'OrderCreated', 'OrderDelivered', 'OrderPaid', 'OrderShipped']);
});

test('повторная отметка оплаты тем же платежом не рождает второе событие', async () => {
  await givenOrder('200.00');
  await confirmed();
  const paymentId = randomUUID();

  await paid(paymentId);
  await paid(paymentId);

  expect(await s.countEvents('OrderPaid')).toBe(1);
});

test('оплатить черновик нельзя: 409 ORDER_INVALID_STATE', async () => {
  await givenOrder('200.00');

  const response = await s.postJson(path('/pay'), adminToken(randomUUID()), { paymentId: randomUUID() }).expect(409);

  expect(response.body.code).toBe('ORDER_INVALID_STATE');
  expect(await currentStatus()).toBe('DRAFT');
});

test('подтверждение заказа дешевле минимума отклоняется без события', async () => {
  await givenOrder('50.00');

  const response = await s.postJson(path('/confirm'), customerToken(customer)).expect(400);

  expect(response.body.code).toBe('ORDER_BELOW_MINIMUM');
  expect(await s.countEvents('OrderConfirmed')).toBe(0);
});

test('чужой продавец не отправит заказ, получение до отправки невозможно', async () => {
  await givenOrder('200.00');
  await confirmed();
  await paid(randomUUID());

  const foreign = await s.postJson(path('/ship'), sellerToken(randomUUID()), { trackingNumber: 'TRACK-99' }).expect(404);
  expect(foreign.body.code).toBe('ORDER_NOT_FOUND');

  const early = await s.postJson(path('/deliver'), customerToken(customer)).expect(409);
  expect(early.body.code).toBe('ORDER_INVALID_STATE');
});

test('отмена оплаченного заказа идёт через возврат в сервисе платежей', async () => {
  await givenOrder('200.00');
  await confirmed();
  const paymentId = randomUUID();
  await paid(paymentId);

  const response = await s.postJson(path('/cancel'), customerToken(customer), { reasonCode: 'changed_mind', comment: 'передумал' }).expect(200);

  expect(response.body.status).toBe('CANCELLED');
  expect(response.body.closedAt).toBe(now.toISOString());
  const requests = payment.requests();
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].path).toBe(`/api/v1/payments/${paymentId}/refund`);
  expect(requests[0].headers['idempotency-key']).toBe(`refund-${orderId}`);
  const cancelled = (await s.outboxRows()).find((row) => row.eventType === 'OrderCancelled');
  expect(cancelled).toBeDefined();
  const payload = JSON.parse(cancelled!.payload) as OrderCancelledPayload;
  expect(payload.previousStatus).toBe('PAID');
  expect(payload.reason).toBe('CHANGED_MIND');
  expect(payload.refundId).toBe(paymentId);
});

test('платежи лежат: отмена не проходит, заказ остаётся PAID', async () => {
  await givenOrder('200.00');
  await confirmed();
  await paid(randomUUID());
  payment.goDown();

  const response = await s.postJson(path('/cancel'), customerToken(customer), { reasonCode: 'changed_mind' }).expect(503);

  expect(response.body.code).toBe('SERVICE_DEGRADED');
  expect(await currentStatus()).toBe('PAID');
  expect(await s.countEvents('OrderCancelled')).toBe(0);
});

test('черновик отменяется без похода в платежи', async () => {
  await givenOrder('200.00');

  const response = await s.postJson(path('/cancel'), customerToken(customer), { reasonCode: 'mistake' }).expect(200);

  expect(response.body.status).toBe('CANCELLED');
  expect(payment.requests()).toHaveLength(0);
});

test('неоплаченный заказ закрывается по таймауту', async () => {
  await givenOrder('200.00');
  await confirmed();

  clock.advance(14 * 60_000);
  expect(await s.expirer.once()).toBe(0);
  clock.advance(2 * 60_000);
  expect(await s.expirer.once()).toBe(1);

  expect(await currentStatus()).toBe('EXPIRED');
  expect(await s.countEvents('OrderExpired')).toBe(1);
});

test('событие PaymentCompleted переводит заказ в PAID ровно один раз', async () => {
  await givenOrder('200.00');
  await confirmed();
  const paymentId = randomUUID();
  const eventId = randomUUID();
  const payload: PaymentCompletedPayload = { paymentId, orderId, amount: '200.00', currency: 'RUB', occurredAt: now.toISOString() };
  const message: KafkaMessage = {
    key: null,
    value: Buffer.from(JSON.stringify(payload)),
    timestamp: '0',
    attributes: 0,
    offset: '0',
    headers: { [HEADER_EVENT_ID]: eventId, [HEADER_EVENT_TYPE]: EVENT_PAYMENT_COMPLETED },
  };
  const handler = new PaymentEventHandler(s.lifecycle);

  await handler.handle(message);
  await handler.handle(message);

  const current = await s.call('get', path(''), customerToken(customer)).expect(200);
  expect(current.body.status).toBe('PAID');
  expect(current.body.paymentId).toBe(paymentId);
  expect(await s.countEvents('OrderPaid')).toBe(1);
});
