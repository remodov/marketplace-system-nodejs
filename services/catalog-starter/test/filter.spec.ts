import { Stand, stand, unique } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());

test('фильтр по цене: граница включается, выдача по возрастанию, без параметра весь каталог', async () => {
  const prefix = unique('Фильтр');
  const expensive = await s.mustCreate(`${prefix} дорогой`, '2500.00', 1);
  const cheap = await s.mustCreate(`${prefix} дешёвый`, '1990.00', 1);
  const boundary = await s.mustCreate(`${prefix} ровно по границе`, '2000.00', 1);

  const res = await s.call('get', '/products?maxPrice=2000').expect(200);
  const found: { id: string; price: number }[] = res.body;
  let last = 0;
  for (const card of found) {
    expect(card.price).toBeLessThanOrEqual(2000);
    expect(card.price).toBeGreaterThanOrEqual(last);
    last = card.price;
  }
  const ids = new Set(found.map((c) => c.id));
  expect(ids.has(cheap.state().id)).toBe(true);
  expect(ids.has(boundary.state().id)).toBe(true);
  expect(ids.has(expensive.state().id)).toBe(false);

  const all = await s.call('get', '/products').expect(200);
  expect(all.body.map((c: { id: string }) => c.id)).toContain(expensive.state().id);
});

test('мусор в maxPrice даёт 400 с именем поля', async () => {
  const res = await s.call('get', '/products?maxPrice=дорого').expect(400);
  expect(res.body.errors.maxPrice).toBeDefined();
});
