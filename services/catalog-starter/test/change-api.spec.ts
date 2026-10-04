import { Stand, stand, unique } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());

const mouse = () => s.mustCreate(unique('Беспроводная мышь'), '1990.00', 5);

test('цена меняется и перечитывается из базы', async () => {
  const p = await mouse();
  const res = await s.call('patch', `/products/${p.state().id}/price`, { price: 1490.0 }).expect(200);
  expect(res.body.price).toBe(1490);
  const read = await s.call('get', `/products/${p.state().id}`).expect(200);
  expect(read.body.price).toBe(1490);
});

test('отрицательная цена отклоняется с именем поля', async () => {
  const p = await mouse();
  const res = await s.call('patch', `/products/${p.state().id}/price`, { price: -1 }).expect(400);
  expect(res.body.errors.price).toBeDefined();
});

test('цена неизвестного товара даёт 404 с идентификатором в detail', async () => {
  const missing = '00000000-0000-4000-8000-00000000abcd';
  const res = await s.call('patch', `/products/${missing}/price`, { price: 100.0 }).expect(404);
  expect(res.body.detail).toContain(missing);
});

test('поступление увеличивает остаток', async () => {
  const p = await mouse();
  const res = await s.call('patch', `/products/${p.state().id}/stock`, { delta: 7 }).expect(200);
  expect(res.body.stock).toBe(12);
});

test('списание ниже нуля это 409, остаток не меняется', async () => {
  const p = await mouse();
  await s.call('patch', `/products/${p.state().id}/stock`, { delta: -9 }).expect(409);
  const read = await s.call('get', `/products/${p.state().id}`).expect(200);
  expect(read.body.stock).toBe(5);
});

test('нулевое изменение остатка это 400', async () => {
  const p = await mouse();
  await s.call('patch', `/products/${p.state().id}/stock`, { delta: 0 }).expect(400);
});

test('пропавшая delta отклоняется с именем поля', async () => {
  const p = await mouse();
  const res = await s.call('patch', `/products/${p.state().id}/stock`, {}).expect(400);
  expect(res.body.errors.delta).toBeDefined();
});

test('списание не может тронуть зарезервированное', async () => {
  const p = await mouse();
  await s.call('post', `/products/${p.state().id}/reserve`, { quantity: 4 }).expect(200);
  await s.call('patch', `/products/${p.state().id}/stock`, { delta: -3 }).expect(409);
  const read = await s.call('get', `/products/${p.state().id}`).expect(200);
  expect([read.body.stock, read.body.reserved, read.body.available]).toEqual([5, 4, 1]);
});
