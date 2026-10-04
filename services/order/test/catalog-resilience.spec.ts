import { randomUUID } from 'node:crypto';
import { CatalogClient, CatalogSettings } from '../src/adapter/out/catalog/catalog.client';
import { answerPrice, customerToken, dropConnection, FakeCatalog, holdFor, orderBody, Script, Stand, stand, startCatalog, testSettings } from './support';

let s: Stand;
let fake: FakeCatalog;

async function given(script: Script, settings?: (defaults: CatalogSettings) => CatalogSettings): Promise<void> {
  fake = await startCatalog(script);
  const defaults = testSettings(fake.url);
  s = await stand(new CatalogClient(settings ? settings(defaults) : defaults));
  await s.clearTables();
}

function placeOrder() {
  return s.call('post', '/api/v1/orders', customerToken(randomUUID()), orderBody(randomUUID(), randomUUID(), 1));
}

afterEach(async () => {
  await s.close();
  await fake.close();
});

test('зависший первый ответ переживается повтором: заказ создан, к каталогу ушло два запроса', async () => {
  await given(async (hit, req, res) => {
    if (hit === 1 && !(await holdFor(res, 2500))) return;
    answerPrice(req, res, '100.00');
  });

  await placeOrder().expect(201);

  expect(await s.ordersInDb()).toBe(1);
  expect(fake.hits()).toBe(2);
});

test('лежащий каталог даёт 503 SERVICE_DEGRADED и ноль заказов в базе', async () => {
  await given((_, req) => dropConnection(req));

  const response = await placeOrder().expect(503);

  expect(response.body.code).toBe('SERVICE_DEGRADED');
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(await s.ordersInDb()).toBe(0);
  expect(fake.hits()).toBe(2);
});

test('медленный каталог отбивается таймаутом раньше, чем ответит', async () => {
  await given(async (_, req, res) => {
    if (await holdFor(res, 4000)) answerPrice(req, res, '100.00');
  });

  const started = Date.now();
  const response = await placeOrder().expect(503);
  const spent = Date.now() - started;

  expect(response.body.code).toBe('SERVICE_DEGRADED');
  expect(spent).toBeLessThan(4000);
  expect(await s.ordersInDb()).toBe(0);
});

test('после трёх сорванных оформлений размыкатель открыт: четвёртое отвечает 503 сразу, каталог не трогается', async () => {
  await given(
    (_, req) => dropConnection(req),
    (defaults) => ({ ...defaults, breakerMinRequests: 3 }),
  );

  for (let i = 0; i < 3; i++) await placeOrder().expect(503);
  expect(fake.hits()).toBe(6);

  const started = Date.now();
  const response = await placeOrder().expect(503);
  const spent = Date.now() - started;

  expect(response.body.code).toBe('SERVICE_DEGRADED');
  expect(spent).toBeLessThan(200);
  expect(fake.hits()).toBe(6);
  expect(await s.ordersInDb()).toBe(0);
});
