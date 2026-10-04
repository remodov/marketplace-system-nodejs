import { HEADER_EVENT_ID, HEADER_EVENT_TYPE } from '@marketplace/contracts-orders-v1';
import { Logger } from '@nestjs/common';
import { Admin, Consumer, EachMessagePayload, IHeaders, Kafka, KafkaMessage, logLevel } from 'kafkajs';
import { InboxProcessor, IncomingEvent, isUuid, NoRecipientError } from '../inbox/inbox';

const RECONNECT_PAUSE_MS = 5000;

export class OrderEventsConsumer {
  private readonly log = new Logger('consumer');
  private readonly admin: Admin;
  private readonly consumer: Consumer;
  private started = false;
  private stopped = false;

  constructor(
    brokers: string[],
    group: string,
    private readonly topic: string,
    private readonly processor: InboxProcessor,
  ) {
    const kafka = new Kafka({ clientId: 'notification', brokers, logLevel: logLevel.WARN });
    this.admin = kafka.admin();
    this.consumer = kafka.consumer({ groupId: group });
  }

  async run(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.start();
        return;
      } catch (error) {
        this.log.warn(`консьюмер не запустился, повторим через ${RECONNECT_PAUSE_MS} мс: ${messageOf(error)}`);
        await pause(RECONNECT_PAUSE_MS);
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.started) await this.consumer.disconnect();
  }

  private async start(): Promise<void> {
    await this.ensureTopic();
    await this.consumer.connect();
    this.started = true;
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });
    await this.consumer.run({ autoCommit: false, eachMessage: (payload) => this.onMessage(payload) });
    this.log.log(`читаем ${this.topic}`);
  }

  private async ensureTopic(): Promise<void> {
    await this.admin.connect();
    try {
      const created = await this.admin.createTopics({ topics: [{ topic: this.topic }], waitForLeaders: true });
      if (created) this.log.log(`топик ${this.topic} создан, продюсер его ещё не писал`);
    } finally {
      await this.admin.disconnect();
    }
  }

  private async onMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
    if (!(await this.handle(message))) return;
    await this.consumer.commitOffsets([{ topic, partition, offset: nextOffset(message.offset) }]);
  }

  private async handle(message: KafkaMessage): Promise<boolean> {
    const event = incomingOf(message);
    if (!event) {
      this.log.warn(`сообщение без обязательных заголовков пропущено, offset ${message.offset}`);
      return true;
    }
    try {
      const processed = await this.processor.process(event);
      if (!processed) this.log.log(`повторная доставка ${event.type} ${event.id}, второе уведомление не создаём`);
      return true;
    } catch (error) {
      if (error instanceof NoRecipientError) {
        this.log.warn(`у события ${event.type} ${event.id} нет адресата`);
        return true;
      }
      this.log.error(`событие ${event.type} ${event.id} не обработано, offset ${message.offset} не сдвигаем: ${messageOf(error)}`);
      return false;
    }
  }
}

function incomingOf(message: KafkaMessage): IncomingEvent | undefined {
  const id = headerOf(message.headers, HEADER_EVENT_ID);
  const type = headerOf(message.headers, HEADER_EVENT_TYPE);
  if (!isUuid(id) || type === undefined || type === '') return undefined;
  return { id: id.toLowerCase(), type, payload: message.value?.toString('utf8') ?? '' };
}

function headerOf(headers: IHeaders | undefined, name: string): string | undefined {
  const value = headers?.[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0]?.toString() : value.toString();
}

function nextOffset(offset: string): string {
  return (BigInt(offset) + 1n).toString();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
