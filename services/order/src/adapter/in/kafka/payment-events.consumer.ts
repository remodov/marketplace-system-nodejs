import { HEADER_EVENT_ID, HEADER_EVENT_TYPE } from '@marketplace/contracts-orders-v1';
import { EVENT_PAYMENT_COMPLETED, PaymentCompletedPayload } from '@marketplace/contracts-payments-v1';
import { Logger } from '@nestjs/common';
import { Admin, Consumer, EachMessagePayload, IHeaders, Kafka, KafkaMessage, logLevel } from 'kafkajs';
import { LifecycleHandler } from '../../../core/order/usecase/lifecycle';

const RECONNECT_PAUSE_MS = 5000;

export class ContractViolationError extends Error {
  constructor(eventId: string, detail: string) {
    super(`payload PaymentCompleted ${eventId} не по контракту: ${detail}`);
    this.name = 'ContractViolationError';
  }
}

export class PaymentEventHandler {
  private readonly log = new Logger('payments');

  constructor(private readonly lifecycle: LifecycleHandler) {}

  async handle(message: KafkaMessage): Promise<void> {
    if (headerOf(message.headers, HEADER_EVENT_TYPE) !== EVENT_PAYMENT_COMPLETED) return;
    const eventId = headerOf(message.headers, HEADER_EVENT_ID);
    if (!isUuid(eventId)) {
      this.log.warn(`событие платежа без event-id пропущено, offset ${message.offset}`);
      return;
    }
    const payload = payloadOf(message, eventId);
    const handled = await this.lifecycle.payFromEvent(eventId.toLowerCase(), EVENT_PAYMENT_COMPLETED, {
      orderId: payload.orderId.toLowerCase(),
      paymentId: payload.paymentId.toLowerCase(),
    });
    if (!handled) this.log.log(`повторная доставка PaymentCompleted ${eventId} пропущена`);
  }
}

export class PaymentEventsConsumer {
  private readonly log = new Logger('payments');
  private readonly admin: Admin;
  private readonly consumer: Consumer;
  private started = false;
  private stopped = false;

  constructor(
    brokers: string[],
    group: string,
    private readonly topic: string,
    private readonly handler: PaymentEventHandler,
  ) {
    const kafka = new Kafka({ clientId: 'order', brokers, logLevel: logLevel.WARN });
    this.admin = kafka.admin();
    this.consumer = kafka.consumer({ groupId: group });
  }

  async run(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.start();
        return;
      } catch (error) {
        this.log.warn(`потребитель событий платежа не запустился, повторим через ${RECONNECT_PAUSE_MS} мс: ${messageOf(error)}`);
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
      if (created) this.log.log(`топик ${this.topic} создан, сервис платежей его ещё не писал`);
    } finally {
      await this.admin.disconnect();
    }
  }

  private async onMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
    try {
      await this.handler.handle(message);
    } catch (error) {
      this.log.error(`событие платежа не обработано, offset ${message.offset} не сдвигаем: ${messageOf(error)}`);
      return;
    }
    await this.consumer.commitOffsets([{ topic, partition, offset: nextOffset(message.offset) }]);
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function payloadOf(message: KafkaMessage, eventId: string): PaymentCompletedPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(message.value?.toString('utf8') ?? '');
  } catch {
    throw new ContractViolationError(eventId, 'тело не JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ContractViolationError(eventId, 'тело не объект');
  const record = raw as Record<string, unknown>;
  if (!isUuid(record.orderId) || !isUuid(record.paymentId)) throw new ContractViolationError(eventId, 'orderId и paymentId должны быть строками UUID');
  return record as PaymentCompletedPayload;
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
