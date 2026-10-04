import { randomUUID } from 'node:crypto';
import { CatalogClient } from '../src/adapter/out/catalog/catalog.client';
import { adminToken, answerNotFound, answerPrice, customerToken, FakeCatalog, orderBody, Script, Stand, stand, startCatalog, testSettings } from './support';

let s: Stand;
let fake: FakeCatalog;

async function given(script: Script): Promise<void> {
  fake = await startCatalog(script);
  s = await stand(new CatalogClient(testSettings(fake.url)));
  await s.clearTables();
}

afterEach(async () => {
  await s.close();
  await fake.close();
});

test('приложение стартует, миграции накатаны, пробы отвечают', async () => {
  await given((_, req, res) => answerPrice(req, res, '100.00'));

  await s.call('get', '/health/live', '').expect(204);
  await s.call('get', '/health/ready', '').expect(204);
  const rows: { table_name: string }[] = await s.db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  expect(rows.map((row) => row.table_name)).toEqual(expect.arrayContaining(['orders', 'order_items', 'migrations']));
});

test('когда каталог отвечает, заказ сохраняется с ценами каталога', async () => {
  await given((_, req, res) => answerPrice(req, res, '2490.50'));
  const customer = randomUUID();
  const seller = randomUUID();
  const product = randomUUID();

  const created = await s.call('post', '/api/v1/orders', customerToken(customer), orderBody(product, seller, 2)).expect(201);

  expect(created.body.status).toBe('DRAFT');
  expect(created.body.total).toBe(4981);
  expect(created.body.currency).toBe('RUB');
  expect(created.body.items[0].unitPrice).toBe(2490.5);
  expect(created.body.items[0].lineTotal).toBe(4981);
  expect(created.headers.location).toBe(`/api/v1/orders/${created.body.id}`);
  const rows: { status: string; total: string; unit_price: string }[] = await s.db.query(
    `SELECT o.status::text AS status, o.total_amount::text AS total, i.unit_price::text AS unit_price
     FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.id = $1`,
    [created.body.id],
  );
  expect(rows).toEqual([{ status: 'DRAFT', total: '4981.00', unit_price: '2490.50' }]);
  expect(fake.hits()).toBe(1);
});

test('неизвестный товар даёт 404 без повтора', async () => {
  await given((_, __, res) => answerNotFound(res));

  const response = await s.call('post', '/api/v1/orders', customerToken(randomUUID()), orderBody(randomUUID(), randomUUID(), 1)).expect(404);

  expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
  expect(await s.ordersInDb()).toBe(0);
  expect(fake.hits()).toBe(1);
});

test('товары двух продавцов отклоняются до похода в каталог', async () => {
  await given((_, req, res) => answerPrice(req, res, '100.00'));
  const body = {
    items: [
      { productId: randomUUID(), sellerId: randomUUID(), quantity: 1 },
      { productId: randomUUID(), sellerId: randomUUID(), quantity: 1 },
    ],
    shippingAddress: { country: 'RU', city: 'Москва', street: 'Тверская, 1', postalCode: '125009' },
  };

  const response = await s.call('post', '/api/v1/orders', customerToken(randomUUID()), body).expect(400);

  expect(response.body.code).toBe('MULTI_SELLER_NOT_SUPPORTED');
  expect(await s.ordersInDb()).toBe(0);
  expect(fake.hits()).toBe(0);
});

test('контракт проверяет позиции и адрес до похода в каталог', async () => {
  await given((_, req, res) => answerPrice(req, res, '100.00'));

  const empty = await s.call('post', '/api/v1/orders', customerToken(randomUUID()), { items: [], shippingAddress: { city: 'Москва', street: 'Тверская, 1' } }).expect(400);
  expect(empty.body.code).toBe('VALIDATION_ERROR');
  expect(empty.body.errors.items).toBeDefined();

  const broken = await s
    .call('post', '/api/v1/orders', customerToken(randomUUID()), {
      items: [{ productId: 'не uuid', sellerId: randomUUID(), quantity: 1000 }],
      shippingAddress: { city: ' ' },
    })
    .expect(400);
  expect(broken.body.code).toBe('VALIDATION_ERROR');
  expect(broken.body.errors['items[0].productId']).toBeDefined();
  expect(broken.body.errors['items[0].quantity']).toBeDefined();
  expect(broken.body.errors['shippingAddress.city']).toBeDefined();
  expect(broken.body.errors['shippingAddress.street']).toBeDefined();

  const malformed = await s.call('post', '/api/v1/orders', customerToken(randomUUID())).set('Content-Type', 'application/json').send('{"items": ').expect(400);
  expect(malformed.body.code).toBe('MALFORMED_REQUEST');

  expect(fake.hits()).toBe(0);
});

test('без токена оформление отклоняется', async () => {
  await given((_, req, res) => answerPrice(req, res, '100.00'));

  const response = await s.call('post', '/api/v1/orders', '', orderBody(randomUUID(), randomUUID(), 1)).expect(401);

  expect(response.body.code).toBe('TOKEN_MISSING');
  expect(fake.hits()).toBe(0);
});

test('чужой покупатель получает 404, администратор видит заказ', async () => {
  await given((_, req, res) => answerPrice(req, res, '100.00'));
  const owner = randomUUID();
  const created = await s.call('post', '/api/v1/orders', customerToken(owner), orderBody(randomUUID(), randomUUID(), 1)).expect(201);
  const path = `/api/v1/orders/${created.body.id}`;

  await s.call('get', path, customerToken(owner)).expect(200);
  const foreign = await s.call('get', path, customerToken(randomUUID())).expect(404);
  expect(foreign.body.code).toBe('ORDER_NOT_FOUND');
  const asAdmin = await s.call('get', path, adminToken(randomUUID())).expect(200);
  expect(asAdmin.body.items).toHaveLength(1);
  expect(asAdmin.body.shippingAddress.city).toBe('Москва');
});
