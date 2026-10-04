import { EVENT_DISPUTE_OPENED, EVENT_ORDER_CREATED, OrderCreatedPayload } from '@marketplace/contracts-orders-v1';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ContractViolationError, InboxProcessor, NoRecipientError, STATUS_PENDING } from '../src/inbox/inbox';
import { clearTables, fixedClock, now, orderCreated, testDatabase } from './support';

let db: DataSource;
let processor: InboxProcessor;

beforeAll(async () => {
  db = await testDatabase();
  processor = new InboxProcessor(db, fixedClock);
});

beforeEach(() => clearTables(db));

afterAll(() => db.destroy());

async function processedEvents(): Promise<number> {
  const rows: { count: string }[] = await db.query('SELECT count(*)::text AS count FROM processed_events');
  return Number(rows[0].count);
}

test('одно и то же событие дважды даёт одно уведомление покупателю', async () => {
  const customer = randomUUID();
  const event = { id: randomUUID(), type: EVENT_ORDER_CREATED, payload: orderCreated(customer, randomUUID(), randomUUID()) };

  expect(await processor.process(event)).toBe(true);
  expect(await processor.process(event)).toBe(false);

  const items = await processor.listByUser(customer);
  expect(items).toHaveLength(1);
  expect(items[0].templateKey).toBe('order-created');
  expect(items[0].status).toBe(STATUS_PENDING);
  expect(items[0].eventId).toBe(event.id);
  expect(await processedEvents()).toBe(1);
});

test('спор адресуется продавцу, а не покупателю', async () => {
  const customer = randomUUID();
  const seller = randomUUID();

  await processor.process({ id: randomUUID(), type: EVENT_DISPUTE_OPENED, payload: orderCreated(customer, seller, randomUUID()) });

  expect(await processor.listByUser(seller)).toHaveLength(1);
  expect((await processor.listByUser(seller))[0].templateKey).toBe('dispute-opened-seller');
  expect(await processor.listByUser(customer)).toHaveLength(0);
});

test('payload не по контракту отклоняется ошибкой разбора и не помечается обработанным', async () => {
  const event = { id: randomUUID(), type: EVENT_ORDER_CREATED, payload: '{"customerId":{"value":"abc"}}' };

  await expect(processor.process(event)).rejects.toBeInstanceOf(ContractViolationError);
  await expect(processor.process(event)).rejects.not.toBeInstanceOf(NoRecipientError);

  expect(await processedEvents()).toBe(0);
});

test('событие без адресата это NoRecipientError, уведомление не сохраняется', async () => {
  const event = { id: randomUUID(), type: EVENT_ORDER_CREATED, payload: JSON.stringify({ orderId: randomUUID() }) };

  await expect(processor.process(event)).rejects.toBeInstanceOf(NoRecipientError);

  expect(await processedEvents()).toBe(0);
});

test('OrderCreated по контракту contracts/orders/v1 обрабатывается и сохраняется как есть', async () => {
  const payload: OrderCreatedPayload = {
    orderId: randomUUID(),
    customerId: randomUUID(),
    sellerId: randomUUID(),
    occurredAt: now.toISOString(),
    totalAmount: '4981.00',
    currency: 'RUB',
    itemsCount: 1,
  };
  const event = { id: randomUUID(), type: EVENT_ORDER_CREATED, payload: JSON.stringify(payload) };

  expect(await processor.process(event)).toBe(true);

  const items = await processor.listByUser(payload.customerId);
  expect(items).toHaveLength(1);
  expect(items[0].eventType).toBe(EVENT_ORDER_CREATED);
  expect(items[0].createdAt).toBe(now.toISOString());
  const rows: { payload: OrderCreatedPayload }[] = await db.query('SELECT payload FROM notifications WHERE event_id = $1', [event.id]);
  expect(rows[0].payload).toEqual(payload);
});
