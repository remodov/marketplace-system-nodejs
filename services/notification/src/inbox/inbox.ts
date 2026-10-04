import { EVENT_DISPUTE_OPENED, EVENT_ORDER_CREATED, EVENT_ORDER_PAID, EVENT_ORDER_SHIPPED, OrderEventBase } from '@marketplace/contracts-orders-v1';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

export const CHANNEL_EMAIL = 'EMAIL';
export const STATUS_PENDING = 'PENDING';
const LIST_LIMIT = 100;

export type IncomingEvent = {
  id: string;
  type: string;
  payload: string;
};

export type Notification = {
  id: string;
  eventId: string;
  eventType: string;
  userId: string;
  channel: string;
  templateKey: string;
  status: string;
  createdAt: string;
};

export interface Clock {
  now(): Date;
}

export class NoRecipientError extends Error {
  constructor() {
    super('в событии нет адресата');
    this.name = 'NoRecipientError';
  }
}

export class ContractViolationError extends Error {
  constructor(eventType: string, detail: string) {
    super(`payload ${eventType} не по контракту: ${detail}`);
    this.name = 'ContractViolationError';
  }
}

type NotificationRow = {
  id: string;
  event_id: string;
  event_type: string;
  user_id: string;
  channel: string;
  template_key: string;
  status: string;
  created_at: Date;
};

export class InboxProcessor {
  constructor(
    private readonly db: DataSource,
    private readonly clock: Clock,
  ) {}

  async process(event: IncomingEvent): Promise<boolean> {
    const recipient = recipientOf(event);
    return this.db.transaction(async (manager) => {
      const claimed: unknown[] = await manager.query(
        `INSERT INTO processed_events (event_id, event_type, processed_at) VALUES ($1, $2, $3)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [event.id, event.type, this.clock.now()],
      );
      if (claimed.length === 0) return false;
      await manager.query(
        `INSERT INTO notifications (id, event_id, event_type, user_id, channel, template_key, status, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [randomUUID(), event.id, event.type, recipient, CHANNEL_EMAIL, templateOf(event.type), STATUS_PENDING, event.payload, this.clock.now()],
      );
      return true;
    });
  }

  async listByUser(userId: string): Promise<Notification[]> {
    const rows: NotificationRow[] = await this.db.query(
      `SELECT id, event_id, event_type, user_id, channel, template_key, status, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, LIST_LIMIT],
    );
    return rows.map(toNotification);
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function recipientOf(event: IncomingEvent): string {
  const base = baseOf(event);
  const recipient = event.type === EVENT_DISPUTE_OPENED ? base.sellerId : base.customerId;
  if (recipient === undefined) throw new NoRecipientError();
  return recipient;
}

function baseOf(event: IncomingEvent): Partial<OrderEventBase> {
  const record = recordOf(event);
  return {
    orderId: uuidField(record, 'orderId', event.type),
    customerId: uuidField(record, 'customerId', event.type),
    sellerId: uuidField(record, 'sellerId', event.type),
  };
}

function recordOf(event: IncomingEvent): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(event.payload);
  } catch {
    throw new ContractViolationError(event.type, 'тело не JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ContractViolationError(event.type, 'тело не объект');
  return raw as Record<string, unknown>;
}

function uuidField(record: Record<string, unknown>, name: string, eventType: string): string | undefined {
  const value = record[name];
  if (value === undefined || value === null) return undefined;
  if (!isUuid(value)) throw new ContractViolationError(eventType, `${name} должен быть строкой UUID, а не ${JSON.stringify(value)}`);
  return value.toLowerCase();
}

function templateOf(eventType: string): string {
  switch (eventType) {
    case EVENT_ORDER_CREATED:
      return 'order-created';
    case EVENT_ORDER_PAID:
      return 'order-paid';
    case EVENT_ORDER_SHIPPED:
      return 'order-shipped';
    case EVENT_DISPUTE_OPENED:
      return 'dispute-opened-seller';
    default:
      return 'order-status-changed';
  }
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    eventId: row.event_id,
    eventType: row.event_type,
    userId: row.user_id,
    channel: row.channel,
    templateKey: row.template_key,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}
