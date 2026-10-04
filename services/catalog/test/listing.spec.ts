import { randomUUID } from 'node:crypto';
import { Stand, stand } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());
beforeEach(() => s.clearTables());

test('витрина показывает всем только опубликованные товары', async () => {
  const seller = randomUUID();
  const published = await s.givenProduct(seller, 'PUBLISHED', '1990.00');
  await s.givenProduct(seller, 'DRAFT', '100.00');
  await s.givenProduct(seller, 'HIDDEN', '200.00');

  const res = await s.call('get', '/api/v1/products?sort=price,asc', '').expect(200);

  expect(res.body.total).toBe(1);
  expect(res.body.items).toHaveLength(1);
  expect(res.body.items[0].id).toBe(published);
  expect(res.body.items[0].sellerId).toBe(seller);
});
