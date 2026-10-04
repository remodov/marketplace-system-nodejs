import { Stand, stand, unique } from './support';

const BUYERS = 100;
const STOCK = 10;

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());

test('сто покупателей продают ровно столько, сколько есть', async () => {
  const p = await s.mustCreate(unique('Билет на распродажу'), '100.00', STOCK);
  const id = p.state().id;

  const outcomes = await Promise.allSettled(Array.from({ length: BUYERS }, () => s.service.reserve(id, 1)));
  const sold = outcomes.filter((o) => o.status === 'fulfilled').length;

  const after = (await s.service.byId(id)).state();
  expect(sold).toBe(STOCK);
  expect([after.reserved, after.stock - after.reserved]).toEqual([STOCK, 0]);
  expect(after.stock).toBe(STOCK);
});
