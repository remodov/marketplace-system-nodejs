import { randomUUID } from 'node:crypto';
import { customerToken, sellerToken, Stand, stand } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());
beforeEach(() => s.clearTables());

test('приложение стартует, миграции накатаны, пробы отвечают', async () => {
  await s.call('get', '/health/live', '').expect(204);
  await s.call('get', '/health/ready', '').expect(204);
  const rows: { table_name: string }[] = await s.db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  const tables = rows.map((row) => row.table_name);
  expect(tables).toEqual(expect.arrayContaining(['products', 'catalog_audit_log', 'migrations']));
});

test('продавец создаёт, публикует и скрывает товар', async () => {
  const seller = randomUUID();

  const created = await s
    .call('post', '/api/v1/products', sellerToken(seller), { title: 'Кофемолка', description: 'ручная', price: 2490.5, currency: 'RUB' })
    .expect(201);
  expect(created.body.status).toBe('DRAFT');
  expect(created.body.price).toBe(2490.5);
  const id: string = created.body.id;
  expect(created.headers.location).toBe(`/api/v1/products/${id}`);

  const hidden = await s.call('get', `/api/v1/products/${id}`, '').expect(404);
  expect(hidden.body.code).toBe('PRODUCT_NOT_FOUND');
  expect(hidden.headers['content-type']).toContain('application/problem+json');

  await s.call('get', `/api/v1/products/${id}`, sellerToken(seller)).expect(200);

  const published = await s.call('post', `/api/v1/products/${id}/publish`, sellerToken(seller)).expect(200);
  expect(published.body.status).toBe('PUBLISHED');

  await s.call('get', `/api/v1/products/${id}`, '').expect(200);

  const again = await s.call('post', `/api/v1/products/${id}/publish`, sellerToken(seller)).expect(409);
  expect(again.body.code).toBe('INVALID_STATE_TRANSITION');

  await s.call('post', `/api/v1/products/${id}/hide`, sellerToken(seller)).expect(200);

  const mine = await s.call('get', '/api/v1/products/my?status=HIDDEN', sellerToken(seller)).expect(200);
  expect(mine.body.total).toBe(1);
  expect(mine.body.items[0].id).toBe(id);

  expect(await s.auditActions()).toEqual([]);
});

test('создание товара проверяет контракт, правила и роль', async () => {
  const seller = randomUUID();

  const fields = await s.call('post', '/api/v1/products', sellerToken(seller), { title: '', price: -1, currency: 'USD' }).expect(400);
  expect(fields.body.code).toBe('VALIDATION_ERROR');
  expect(fields.body.errors.title).toBeDefined();
  expect(fields.body.errors.price).toBeDefined();

  const currency = await s.call('post', '/api/v1/products', sellerToken(seller), { title: 'Кружка', price: 100, currency: 'USD' }).expect(400);
  expect(currency.body.code).toBe('INVALID_CURRENCY');

  const customer = await s.call('post', '/api/v1/products', customerToken(randomUUID()), { title: 'Кружка', price: 100, currency: 'RUB' }).expect(403);
  expect(customer.body.code).toBe('ACCESS_DENIED');

  const malformed = await s
    .call('post', '/api/v1/products', sellerToken(seller))
    .set('Content-Type', 'application/json')
    .send('{"title": ')
    .expect(400);
  expect(malformed.body.code).toBe('MALFORMED_REQUEST');

  const badToken = await s.call('post', '/api/v1/products', 'seller', { title: 'Кружка', price: 100, currency: 'RUB' }).expect(401);
  expect(badToken.body.code).toBe('TOKEN_INVALID');
});
