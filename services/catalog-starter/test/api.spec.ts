import { Stand, stand, unique } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());

test('созданный товар читается по id', async () => {
  const created = await s.call('post', '/products', { title: 'Беспроводная мышь', price: 1990.0, stock: 7 }).expect(201);
  expect(created.body.title).toBe('Беспроводная мышь');
  const read = await s.call('get', `/products/${created.body.id}`).expect(200);
  expect(read.body.stock).toBe(7);
});

test('поиск находит по части названия', async () => {
  const title = unique('Механическая клавиатура');
  await s.mustCreate(title, '5400.00', 3);
  const part = title.slice('Механическая '.length);
  const res = await s.call('get', `/products?query=${encodeURIComponent(part)}`).expect(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].title).toBe(title);
});

test('резерв удерживает остаток, а не списывает', async () => {
  const p = await s.mustCreate(unique('USB-хаб'), '890.00', 5);
  const res = await s.call('post', `/products/${p.state().id}/reserve`, { quantity: 2 }).expect(200);
  expect([res.body.stock, res.body.reserved, res.body.available]).toEqual([5, 2, 3]);
});

test('резерв сверх остатка отклоняется', async () => {
  const p = await s.mustCreate(unique('Коврик'), '450.00', 1);
  await s.call('post', `/products/${p.state().id}/reserve`, { quantity: 4 }).expect(409);
});

test('неизвестный товар даёт 404', async () => {
  const res = await s.call('get', `/products/${'00000000-0000-4000-8000-000000000001'}`).expect(404);
  expect(res.headers['content-type']).toContain('application/problem+json');
  expect(res.body.detail).toContain('не найден');
});
