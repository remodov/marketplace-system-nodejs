import {
  HEADER_AGGREGATE_ID,
  HEADER_AGGREGATE_TYPE,
  HEADER_EVENT_ID,
  HEADER_EVENT_TYPE,
  HEADER_EVENT_VERSION,
  HEADER_OCCURRED_AT,
} from '@marketplace/contracts-orders-v1';
import { Kafka, logLevel, Partitioners, Producer } from 'kafkajs';
import { ExternalEventPublisher, OutboxMessage } from '../../../core/order/port/out/ports';

const ACKS_ALL = -1;

export class KafkaPublisher implements ExternalEventPublisher {
  private readonly producer: Producer;
  private connecting?: Promise<void>;

  constructor(
    brokers: string[],
    private readonly topic: string,
  ) {
    this.producer = new Kafka({ clientId: 'order', brokers, logLevel: logLevel.WARN }).producer({
      allowAutoTopicCreation: true,
      createPartitioner: Partitioners.DefaultPartitioner,
    });
  }

  async publish(message: OutboxMessage): Promise<void> {
    await this.connect();
    await this.producer.send({
      topic: this.topic,
      acks: ACKS_ALL,
      messages: [{ key: message.aggregateId, value: message.payload, headers: headersOf(message) }],
    });
  }

  async close(): Promise<void> {
    if (!this.connecting) return;
    await this.producer.disconnect();
  }

  private connect(): Promise<void> {
    this.connecting ??= this.producer.connect().catch((error: unknown) => {
      this.connecting = undefined;
      throw error;
    });
    return this.connecting;
  }
}

function headersOf(message: OutboxMessage): Record<string, string> {
  return {
    [HEADER_EVENT_ID]: message.id,
    [HEADER_EVENT_TYPE]: message.eventType,
    [HEADER_EVENT_VERSION]: String(message.eventVersion),
    [HEADER_AGGREGATE_TYPE]: message.aggregateType,
    [HEADER_AGGREGATE_ID]: message.aggregateId,
    [HEADER_OCCURRED_AT]: message.occurredAt.toISOString(),
  };
}
