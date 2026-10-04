import { EntityManager } from 'typeorm';
import { conflict } from '../../../core/apperr';
import { IdempotencyKeys } from '../../../core/order/port/out/ports';

type IdempotencyKeyRow = {
  request_hash: string;
  order_id: string;
};

export class TypeOrmIdempotencyKeys implements IdempotencyKeys {
  constructor(private readonly manager: EntityManager) {}

  async find(key: string, requestHash: string): Promise<string | undefined> {
    const rows: IdempotencyKeyRow[] = await this.manager.query(
      'SELECT request_hash, order_id FROM idempotency_keys WHERE idempotency_key = $1',
      [key],
    );
    if (rows.length === 0) return undefined;
    if (rows[0].request_hash !== requestHash) {
      throw conflict('IDEMPOTENCY_KEY_CONFLICT', 'Ключ Idempotency-Key уже использован для другого запроса');
    }
    return rows[0].order_id;
  }

  async claim(key: string, requestHash: string, orderId: string, now: Date): Promise<boolean> {
    const inserted: unknown[] = await this.manager.query(
      `INSERT INTO idempotency_keys (idempotency_key, request_hash, order_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [key, requestHash, orderId, now],
    );
    return inserted.length === 1;
  }
}
