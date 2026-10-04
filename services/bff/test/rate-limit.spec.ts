import { randomUUID } from 'node:crypto';
import { Neighbours, neighbours, Stand, stand } from './support';

let n: Neighbours;
let s: Stand;

beforeEach(async () => {
  n = await neighbours();
  s = await stand(n, 3);
});

afterEach(async () => {
  await s.close();
  await n.close();
});

test('четвёртый запрос за минуту получает 429 с Retry-After', async () => {
  const client = randomUUID();
  for (let i = 1; i <= 3; i++) {
    const response = await s.get(`/api/v1/screens/order/${n.orderId}`, client);
    expect(response.status).not.toBe(429);
    expect(response.headers['x-ratelimit-remaining']).toBe(String(3 - i));
  }

  const rejected = await s.get(`/api/v1/screens/order/${n.orderId}`, client).expect(429);

  expect(rejected.body.code).toBe('RATE_LIMITED');
  expect(rejected.headers['retry-after']).toBe('60');
  expect(rejected.headers['x-ratelimit-remaining']).toBe('0');
  expect(rejected.headers['content-type']).toContain('application/problem+json');
  expect(n.order.calls()).toBe(3);
});

test('квота считается на каждого клиента', async () => {
  const noisy = randomUUID();
  const quiet = randomUUID();
  for (let i = 0; i < 4; i++) await s.get(`/api/v1/screens/order/${n.orderId}`, noisy);

  const response = await s.get(`/api/v1/screens/order/${n.orderId}`, quiet);

  expect(response.status).not.toBe(429);
});
