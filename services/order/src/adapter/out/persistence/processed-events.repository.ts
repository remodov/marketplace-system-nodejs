import { EntityManager } from 'typeorm';
import { ProcessedEvents } from '../../../core/order/port/out/ports';

export class TypeOrmProcessedEvents implements ProcessedEvents {
  constructor(private readonly manager: EntityManager) {}

  async markProcessed(eventId: string, eventType: string, now: Date): Promise<boolean> {
    const inserted: unknown[] = await this.manager.query(
      `INSERT INTO processed_events (event_id, event_type, processed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, eventType, now],
    );
    return inserted.length === 1;
  }
}
