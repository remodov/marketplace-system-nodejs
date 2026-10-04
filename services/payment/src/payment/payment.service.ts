import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { moveTo, Payment, Status } from './payment';
import { findByOrderId, insert, requireById, updateStatus } from './payment.repository';

export interface Clock {
  now(): Date;
}

export class PaymentService {
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
  ) {}

  authorize(orderId: string, amount: Decimal, currency: string): Promise<Payment> {
    return this.inTx(async (tx) => {
      const existing = await findByOrderId(tx, orderId);
      if (existing) return existing;
      const now = this.clock.now();
      const payment: Payment = {
        id: randomUUID(),
        orderId,
        amount: amount.toDecimalPlaces(2),
        currency,
        status: 'AUTHORIZED',
        createdAt: now,
        updatedAt: now,
      };
      await insert(tx, payment);
      return payment;
    });
  }

  capture(id: string): Promise<Payment> {
    return this.moveTo(id, 'CAPTURED');
  }

  refund(id: string): Promise<Payment> {
    return this.inTx(async (tx) => {
      const current = await requireById(tx, id);
      if (current.status === 'REFUNDED') return current;
      const refunded = moveTo(current, 'REFUNDED', this.clock.now());
      await updateStatus(tx, refunded);
      return refunded;
    });
  }

  byId(id: string): Promise<Payment> {
    return requireById(this.pool, id);
  }

  private moveTo(id: string, next: Status): Promise<Payment> {
    return this.inTx(async (tx) => {
      const current = await requireById(tx, id);
      const moved = moveTo(current, next, this.clock.now());
      await updateStatus(tx, moved);
      return moved;
    });
  }

  private async inTx<T>(work: (tx: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
