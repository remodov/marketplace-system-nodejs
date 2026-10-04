import { Stand, stand, unique } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());

test('скидка применяется', async () => {
  const p = await s.mustCreate(unique('Беспроводная мышь'), '1990.00', 5);
  const res = await s.call('patch', `/products/${p.state().id}/discount`, { percent: 20 }).expect(200);
  expect(res.body.price).toBe(1592);
});

test('слишком глубокая скидка отклоняется с пределом в detail', async () => {
  const p = await s.mustCreate(unique('Беспроводная мышь'), '1990.00', 5);
  const res = await s.call('patch', `/products/${p.state().id}/discount`, { percent: 80 }).expect(400);
  expect(res.body.detail).toContain('50');
  const read = await s.call('get', `/products/${p.state().id}`).expect(200);
  expect(read.body.price).toBe(1990);
});
