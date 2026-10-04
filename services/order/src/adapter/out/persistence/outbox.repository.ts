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

  // TODO шаг 10: каждое событие строкой в outbox тем же EntityManager, что и заказ,
  // published_at пустой.
  async append(events: OrderEvent[]): Promise<void> {}

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

// TODO шаг 10: собрать payload по внешнему контракту из @marketplace/contracts-orders-v1,
// а не отдавать наружу внутреннее событие как есть.
function payloadOf(event: OrderEvent): string {
  return JSON.stringify(event);
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
