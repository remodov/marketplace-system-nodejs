import { DataSource } from 'typeorm';
import { Stand, stand } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());

test('миграции дают каждую колонку, которую читает сущность', async () => {
  const rows: { column_name: string }[] = await s.app
    .get(DataSource)
    .query("SELECT column_name FROM information_schema.columns WHERE table_name = 'products'");
  const have = new Set(rows.map((r) => r.column_name));
  for (const want of ['id', 'title', 'price', 'stock', 'reserved', 'version']) {
    expect(have.has(want)).toBe(true);
  }
});

test('триграммный индекс по названию на месте', async () => {
  const rows: { indexname: string }[] = await s.app
    .get(DataSource)
    .query("SELECT indexname FROM pg_indexes WHERE tablename = 'products' AND indexdef LIKE '%gin_trgm_ops%'");
  expect(rows).toHaveLength(1);
});
