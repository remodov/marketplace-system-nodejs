import { EVENT_ORDER_CONFIRMED, EVENT_ORDER_CREATED, OrderCreatedPayload } from '@marketplace/contracts-orders-v1';
import { randomUUID } from 'node:crypto';
import { CatalogClient } from '../src/adapter/out/catalog/catalog.client';
import { answerPrice, customerToken, FakeCatalog, now, orderBody, RecordingPublisher, Stand, stand, startCatalog, testSettings } from './support';

let s: Stand;
let fake: FakeCatalog;

async function given(price: string, publisher = new RecordingPublisher()): Promise<RecordingPublisher> {
  fake = await startCatalog((_, req, res) => answerPrice(req, res, price));
  s = await stand(new CatalogClient(testSettings(fake.url)), publisher);
  await s.clearTables();
  return publisher;
}

afterEach(async () => {
  await s.close();
  await fake.close();
});

test('строка outbox рождается вместе с заказом и ещё не отправлена', async () => {
  await given('2490.50');

  const created = await s.postOrder(customerToken(randomUUID()), orderBody(randomUUID(), randomUUID(), 2)).expect(201);

  const rows = await s.outboxRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].eventType).toBe(EVENT_ORDER_CREATED);
  expect(rows[0].aggregateId).toBe(created.body.id);
  expect(rows[0].published).toBe(false);
});

test('поля payload ровно те, что во внешнем контракте', async () => {
  await given('2490.50');
  const customer = randomUUID();
  const seller = randomUUID();

  const created = await s.postOrder(customerToken(customer), orderBody(randomUUID(), seller, 2)).expect(201);

  const rows = await s.outboxRows();
  expect(rows).toHaveLength(1);
  const raw = JSON.parse(rows[0].payload) as Record<string, unknown>;
  expect(Object.keys(raw).sort()).toEqual(['currency', 'customerId', 'itemsCount', 'occurredAt', 'orderId', 'sellerId', 'totalAmount']);
  expect(raw.customerId).toBe(customer);
  expect(raw.sellerId).toBe(seller);
  expect(raw.totalAmount).toBe('4981.00');
  expect(raw.currency).toBe('RUB');
  expect(raw.itemsCount).toBe(1);
  const payload = raw as OrderCreatedPayload;
  expect(payload.orderId).toBe(created.body.id);
  expect(payload.occurredAt).toBe(now.toISOString());
});

test('повтор идемпотентного запроса не рождает второе событие', async () => {
  await given('100.00');
  const customer = customerToken(randomUUID());
  const key = randomUUID();
  const body = orderBody(randomUUID(), randomUUID(), 1);

  await s.postOrder(customer, body, key).expect(201);
  await s.postOrder(customer, body, key).expect(200);

  expect(await s.outboxRows()).toHaveLength(1);
});

test('relay публикует неотправленные строки и помечает их', async () => {
  const publisher = await given('100.00');
  const first = await s.givenOutboxRow(EVENT_ORDER_CREATED, '{"orderId":"a"}', now);
  const second = await s.givenOutboxRow(EVENT_ORDER_CONFIRMED, '{"orderId":"b"}', new Date(now.getTime() + 1000));

  expect(await s.relay.once()).toBe(2);
  expect(await s.relay.once()).toBe(0);

  const messages = publisher.published();
  expect(messages.map((message) => message.id)).toEqual([first, second]);
  expect(messages[0].eventType).toBe(EVENT_ORDER_CREATED);
  expect(messages[0].aggregateType).toBe('Order');
  expect(messages[0].eventVersion).toBe(1);
  expect(messages[0].payload).toBe('{"orderId": "a"}');
  expect((await s.outboxRows()).every((row) => row.published)).toBe(true);
});

test('при лежащем брокере relay бросает ошибку, а строка остаётся неотправленной', async () => {
  await given('100.00', new RecordingPublisher(new Error('брокер лежит')));
  await s.givenOutboxRow(EVENT_ORDER_CREATED, '{"orderId":"a"}');

  await expect(s.relay.once()).rejects.toThrow('публикация OrderCreated');

  const rows = await s.outboxRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].published).toBe(false);
});
