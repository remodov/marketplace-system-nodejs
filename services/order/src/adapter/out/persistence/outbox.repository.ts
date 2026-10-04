import { OrderCreatedPayload } from '@marketplace/contracts-orders-v1';
import { EntityManager } from 'typeorm';
import { OrderEvent } from '../../../core/order/aggregate/events';
import { EventOutbox, IdGenerator, OutboxMessage } from '../../../core/order/port/out/ports';

const AGGREGATE_ORDER = 'Order';
const EVENT_VERSION = 1;

type OutboxRow = {
  id: string;
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  event_version: number;
  payload: string;
  occurred_at: Date;
};

export class TypeOrmOutbox implements EventOutbox {
  constructor(
    private readonly manager: EntityManager,
    private readonly ids: IdGenerator,
  ) {}

  async append(events: OrderEvent[]): Promise<void> {
    for (const event of events) {
      await this.manager.query(
        `INSERT INTO outbox (id, aggregate_id, aggregate_type, event_type, event_version, payload, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [this.ids.newId(), event.orderId, AGGREGATE_ORDER, event.type, EVENT_VERSION, payloadOf(event), event.occurredAt],
      );
    }
  }

  async unpublished(limit: number): Promise<OutboxMessage[]> {
    const rows: OutboxRow[] = await this.manager.query(
      `SELECT id, aggregate_id, aggregate_type, event_type, event_version, payload::text AS payload, occurred_at
       FROM outbox
       WHERE published_at IS NULL
       ORDER BY occurred_at, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    return rows.map(toMessage);
  }

  async markPublished(id: string, at: Date): Promise<void> {
    await this.manager.query('UPDATE outbox SET published_at = $2 WHERE id = $1', [id, at]);
  }
}

function payloadOf(event: OrderEvent): string {
  switch (event.type) {
    case 'OrderCreated': {
      const payload: OrderCreatedPayload = {
        orderId: event.orderId,
        customerId: event.customerId,
        sellerId: event.sellerId,
        occurredAt: event.occurredAt.toISOString(),
        totalAmount: event.total.amount.toFixed(2),
        currency: event.total.currency,
        itemsCount: event.items.length,
      };
      return JSON.stringify(payload);
    }
  }
}

function toMessage(row: OutboxRow): OutboxMessage {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    eventVersion: row.event_version,
    payload: row.payload,
    occurredAt: row.occurred_at,
  };
}
