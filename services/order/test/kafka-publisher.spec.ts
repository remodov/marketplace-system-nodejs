import { EVENT_ORDER_CREATED, HEADER_AGGREGATE_ID, HEADER_EVENT_ID, HEADER_EVENT_TYPE, HEADER_EVENT_VERSION, TOPIC } from '@marketplace/contracts-orders-v1';
import { Kafka, KafkaMessage, logLevel } from 'kafkajs';
import { randomUUID } from 'node:crypto';
import { KafkaPublisher } from '../src/adapter/out/kafka/kafka.publisher';
import { OutboxMessage } from '../src/core/order/port/out/ports';
import { now } from './support';

const broker = process.env.KAFKA_BROKERS ?? 'localhost:9095';

function kafka(): Kafka {
  return new Kafka({ clientId: 'order-test', brokers: [broker], logLevel: logLevel.NOTHING, connectionTimeout: 2000, retry: { retries: 1 } });
}

async function brokerReachable(): Promise<boolean> {
  const admin = kafka().admin();
  try {
    await admin.connect();
    await admin.disconnect();
    return true;
  } catch {
    return false;
  }
}

function headersOf(message: KafkaMessage): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(message.headers ?? {}).map(([name, value]) => [name, Array.isArray(value) ? value[0]?.toString() : value?.toString()]));
}

test('издатель доставляет payload с заголовками события, ключ сообщения - идентификатор заказа', async () => {
  if (!(await brokerReachable())) {
    console.warn(`Kafka на ${broker} недоступна: подними стенд командой docker compose -f infra/compose.yaml up -d kafka; проверка издателя пропущена`);
    return;
  }
  const topic = `${TOPIC}.test-${randomUUID()}`;
  const publisher = new KafkaPublisher([broker], topic);
  const consumer = kafka().consumer({ groupId: `order-test-${randomUUID()}` });
  const message: OutboxMessage = {
    id: randomUUID(),
    aggregateType: 'Order',
    aggregateId: randomUUID(),
    eventType: EVENT_ORDER_CREATED,
    eventVersion: 1,
    payload: '{"orderId":"x"}',
    occurredAt: now,
  };
  try {
    await publisher.publish(message);

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    const received = await new Promise<KafkaMessage>((resolve) => {
      void consumer.run({ eachMessage: async ({ message: delivered }) => resolve(delivered) });
    });

    expect(received.key?.toString()).toBe(message.aggregateId);
    expect(received.value?.toString()).toBe('{"orderId":"x"}');
    const headers = headersOf(received);
    expect(headers[HEADER_EVENT_ID]).toBe(message.id);
    expect(headers[HEADER_EVENT_TYPE]).toBe(EVENT_ORDER_CREATED);
    expect(headers[HEADER_EVENT_VERSION]).toBe('1');
    expect(headers[HEADER_AGGREGATE_ID]).toBe(message.aggregateId);
  } finally {
    await consumer.disconnect();
    await publisher.close();
    await deleteTopic(topic);
  }
});

async function deleteTopic(topic: string): Promise<void> {
  const admin = kafka().admin();
  await admin.connect();
  try {
    await admin.deleteTopics({ topics: [topic] });
  } finally {
    await admin.disconnect();
  }
}
