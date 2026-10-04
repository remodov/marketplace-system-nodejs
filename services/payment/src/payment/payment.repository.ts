import Decimal from 'decimal.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryResult } from 'pg';
import { parseStatus, Payment } from './payment';

export interface Querier {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
}

export class PaymentNotFoundError extends Error {
  constructor(readonly paymentId: string) {
    super(`платёж ${paymentId} не найден`);
    this.name = 'PaymentNotFoundError';
  }
}

type PaymentRow = {
  id: string;
  order_id: string;
  amount: string;
  currency: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

const SELECT_PAYMENT = 'SELECT id, order_id, amount::text AS amount, currency, status, created_at, updated_at FROM payments';

export async function ensureSchema(db: Querier): Promise<void> {
  await db.query(schema);
}

export async function findById(db: Querier, id: string): Promise<Payment | undefined> {
  const result = await db.query(`${SELECT_PAYMENT} WHERE id = $1`, [id]);
  return firstOf(result);
}

export async function requireById(db: Querier, id: string): Promise<Payment> {
  const payment = await findById(db, id);
  if (!payment) throw new PaymentNotFoundError(id);
  return payment;
}

export async function findByOrderId(db: Querier, orderId: string): Promise<Payment | undefined> {
  const result = await db.query(`${SELECT_PAYMENT} WHERE order_id = $1`, [orderId]);
  return firstOf(result);
}

export async function insert(db: Querier, payment: Payment): Promise<void> {
  await db.query(
    `INSERT INTO payments (id, order_id, amount, currency, status, created_at, updated_at)
     VALUES ($1, $2, $3::numeric, $4, $5, $6, $7)`,
    [payment.id, payment.orderId, payment.amount.toFixed(2), payment.currency, payment.status, payment.createdAt, payment.updatedAt],
  );
}

export async function updateStatus(db: Querier, payment: Payment): Promise<void> {
  await db.query('UPDATE payments SET status = $2, updated_at = $3 WHERE id = $1', [payment.id, payment.status, payment.updatedAt]);
}

function firstOf(result: QueryResult): Payment | undefined {
  const row = result.rows[0] as PaymentRow | undefined;
  return row === undefined ? undefined : toPayment(row);
}

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    orderId: row.order_id,
    amount: new Decimal(row.amount),
    currency: row.currency,
    status: parseStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
