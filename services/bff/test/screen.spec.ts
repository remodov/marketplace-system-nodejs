import { randomUUID } from 'node:crypto';
import { Neighbours, neighbours, Stand, stand } from './support';

let n: Neighbours;
let s: Stand;

beforeEach(async () => {
  n = await neighbours();
  s = await stand(n);
});

afterEach(async () => {
  await s.close();
  await n.close();
});

test('экран собран из трёх сервисов', async () => {
  const response = await s.get(`/api/v1/screens/order/${n.orderId}`).expect(200);

  expect(response.body).toEqual({
    orderId: n.orderId,
    status: 'PAID',
    total: 3980,
    paymentStatus: 'CAPTURED',
    items: [{ productId: n.productId, title: 'Беспроводная мышь', quantity: 2, price: 1990 }],
  });
  expect([n.order.calls(), n.catalog.calls(), n.payment.calls()]).toEqual([1, 1, 1]);
});

test('экран переживает отсутствие платежа', async () => {
  n.payment.failWith(404);

  const response = await s.get(`/api/v1/screens/order/${n.orderId}`).expect(200);

  expect(response.body.paymentStatus).toBe('NONE');
  expect(response.body.items).toHaveLength(1);
  expect(response.body.items[0].title).toBe('Беспроводная мышь');
});

test('лежащий сосед даёт 502 DOWNSTREAM_UNAVAILABLE', async () => {
  await n.catalog.close();

  const response = await s.get(`/api/v1/screens/order/${n.orderId}`).expect(502);

  expect(response.body.code).toBe('DOWNSTREAM_UNAVAILABLE');
  expect(response.headers['content-type']).toContain('application/problem+json');
});

test('неизвестный заказ это 404 ORDER_NOT_FOUND, к соседям за ним не ходим', async () => {
  n.order.failWith(404);

  const response = await s.get(`/api/v1/screens/order/${randomUUID()}`).expect(404);

  expect(response.body.code).toBe('ORDER_NOT_FOUND');
  expect([n.catalog.calls(), n.payment.calls()]).toEqual([0, 0]);
});
