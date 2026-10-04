import { randomUUID } from 'node:crypto';
import { adminToken, sellerToken, Stand, stand } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());
beforeEach(() => s.clearTables());

test('владелец меняет цену, она перечитывается из базы', async () => {
  const seller = randomUUID();
  const id = await s.givenProduct(seller, 'PUBLISHED', '89990.00');

  const res = await s.call('patch', `/api/v1/products/${id}/price`, sellerToken(seller), { price: 79990.0 }).expect(200);

  expect(res.body.price).toBe(79990);
  expect(await s.priceInDb(id)).toBe('79990.00');
});

test('ноль даёт VALIDATION_ERROR до вызова ядра', async () => {
  const seller = randomUUID();
  const id = await s.givenProduct(seller, 'PUBLISHED', '89990.00');

  const res = await s.call('patch', `/api/v1/products/${id}/price`, sellerToken(seller), { price: 0 }).expect(400);

  expect(res.body.code).toBe('VALIDATION_ERROR');
  expect(res.body.errors.price).toBeDefined();
  expect(await s.priceInDb(id)).toBe('89990.00');
});

test('чужой товар это 404 OWN_PRODUCT_REQUIRED', async () => {
  const seller = randomUUID();
  const id = await s.givenProduct(randomUUID(), 'PUBLISHED', '89990.00');

  const res = await s.call('patch', `/api/v1/products/${id}/price`, sellerToken(seller), { price: 79990.0 }).expect(404);

  expect(res.body.code).toBe('OWN_PRODUCT_REQUIRED');
  expect(await s.priceInDb(id)).toBe('89990.00');
});

test('неизвестный товар это 404 PRODUCT_NOT_FOUND', async () => {
  const res = await s.call('patch', `/api/v1/products/${randomUUID()}/price`, sellerToken(randomUUID()), { price: 79990.0 }).expect(404);

  expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
});

test('администратор меняет чужую цену и оставляет запись в журнале', async () => {
  const admin = randomUUID();
  const id = await s.givenProduct(randomUUID(), 'PUBLISHED', '89990.00');

  const res = await s.call('patch', `/api/v1/products/${id}/price`, adminToken(admin), { price: 1000.0 }).expect(200);

  expect(res.body.price).toBe(1000);
  expect(await s.auditActions()).toContain('PRODUCT_PRICE_CHANGED');
  const rows: { actor_id: string; metadata: Record<string, string> }[] = await s.db.query('SELECT actor_id, metadata FROM catalog_audit_log');
  expect(rows[0].actor_id).toBe(admin);
  expect(rows[0].metadata).toEqual({ from: '89990.00', to: '1000.00', ownerSellerId: expect.any(String) });
});

test('без токена это 401 TOKEN_MISSING', async () => {
  const id = await s.givenProduct(randomUUID(), 'PUBLISHED', '89990.00');

  const res = await s.call('patch', `/api/v1/products/${id}/price`, '', { price: 1.0 }).expect(401);

  expect(res.body.code).toBe('TOKEN_MISSING');
  expect(res.headers['www-authenticate']).toBe('Bearer');
  expect(await s.priceInDb(id)).toBe('89990.00');
});
