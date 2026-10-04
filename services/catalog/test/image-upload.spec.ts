import { randomUUID } from 'node:crypto';
import { sellerToken, Stand, stand } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());
beforeEach(() => s.clearTables());

const uploadUrlPath = (product: string): string => `/api/v1/products/${product}/image-upload-url`;

test('владелец получает подписанную ссылку со сроком', async () => {
  const seller = randomUUID();
  const product = await s.givenProduct(seller, 'PUBLISHED', '1000.00');

  const res = await s.call('post', uploadUrlPath(product), sellerToken(seller), { contentType: 'image/jpeg' }).expect(200);

  const key: string = res.body.key;
  expect(key.startsWith(`products/${product}/`)).toBe(true);
  const url = new URL(res.body.url);
  expect(url.pathname).toBe(`/marketplace-images/${key}`);
  expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
  expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
  expect(res.body.expiresAt).toBe('2026-04-28T11:10:00.000Z');
});

test('чужой товар выглядит несуществующим', async () => {
  const product = await s.givenProduct(randomUUID(), 'PUBLISHED', '1000.00');

  const res = await s.call('post', uploadUrlPath(product), sellerToken(randomUUID()), { contentType: 'image/jpeg' }).expect(404);

  expect(res.body.code).toBe('OWN_PRODUCT_REQUIRED');
});

test('неизвестный товар даёт 404', async () => {
  const res = await s.call('post', uploadUrlPath(randomUUID()), sellerToken(randomUUID()), { contentType: 'image/jpeg' }).expect(404);

  expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
});

test('без токена ссылки нет', async () => {
  const product = await s.givenProduct(randomUUID(), 'PUBLISHED', '1000.00');

  const res = await s.call('post', uploadUrlPath(product), '', { contentType: 'image/jpeg' }).expect(401);

  expect(res.body.code).toBe('TOKEN_MISSING');
});

test('не картинка отклоняется на входе', async () => {
  const seller = randomUUID();
  const product = await s.givenProduct(seller, 'PUBLISHED', '1000.00');

  const res = await s.call('post', uploadUrlPath(product), sellerToken(seller), { contentType: 'application/zip' }).expect(400);

  expect(res.body.code).toBe('VALIDATION_ERROR');
  expect(res.body.errors.contentType).toBeDefined();
});
