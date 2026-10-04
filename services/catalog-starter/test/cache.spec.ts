import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import { Product } from '../src/product/product.entity';
import { ProductRepository } from '../src/product/product.repository';
import { PRODUCT_STORE, ProductStore } from '../src/product/product.store';
import { Stand, stand, unique } from './support';

class CountingStore implements ProductStore {
  byIdCalls = 0;

  constructor(private readonly inner: ProductStore) {}

  all = () => this.inner.all();
  byTitle = (part: string) => this.inner.byTitle(part);
  cheaper = (max: Decimal) => this.inner.cheaper(max);
  byIdForUpdate = (id: string) => this.inner.byIdForUpdate(id);
  insert = (p: Product) => this.inner.insert(p);
  update = (p: Product) => this.inner.update(p);
  withTx = <T>(fn: (tx: ProductStore) => Promise<T>) => this.inner.withTx(fn);

  byId(id: string): Promise<Product> {
    this.byIdCalls += 1;
    return this.inner.byId(id);
  }
}

let s: Stand;
let counting: CountingStore;

beforeAll(async () => {
  s = await stand((b) =>
    b.overrideProvider(PRODUCT_STORE).useFactory({
      factory: (ds: DataSource) => {
        counting = new CountingStore(new ProductRepository(ds.manager));
        return counting;
      },
      inject: [DataSource],
    }),
  );
});
afterAll(() => s.close());

const mouse = () => s.mustCreate(unique('Мышь для кэша'), '1990.00', 5);

test('повторный запрос карточки отвечает из кэша', async () => {
  const id = (await mouse()).state().id;
  counting.byIdCalls = 0;
  for (let i = 0; i < 3; i++) await s.call('get', `/products/${id}`).expect(200);
  expect(counting.byIdCalls).toBe(1);
});

test('смена цены сбрасывает кэш', async () => {
  const id = (await mouse()).state().id;
  expect((await s.call('get', `/products/${id}`).expect(200)).body.price).toBe(1990);
  await s.call('patch', `/products/${id}/price`, { price: 1490.0 }).expect(200);
  expect((await s.call('get', `/products/${id}`).expect(200)).body.price).toBe(1490);
});

test('резерв сбрасывает кэш', async () => {
  const id = (await mouse()).state().id;
  expect((await s.call('get', `/products/${id}`).expect(200)).body.available).toBe(5);
  await s.service.reserve(id, 2);
  const card = (await s.call('get', `/products/${id}`).expect(200)).body;
  expect([card.available, card.reserved]).toEqual([3, 2]);
});
