import Decimal from 'decimal.js';

export type Status = 'AUTHORIZED' | 'CAPTURED' | 'REFUNDED' | 'FAILED';

export const STATUSES: readonly Status[] = ['AUTHORIZED', 'CAPTURED', 'REFUNDED', 'FAILED'];

export function parseStatus(raw: string): Status {
  const status = STATUSES.find((known) => known === raw);
  if (!status) throw new Error(`статус платежа в базе неизвестен: ${raw}`);
  return status;
}

export function canMoveTo(from: Status, next: Status): boolean {
  switch (from) {
    case 'AUTHORIZED':
      return next === 'CAPTURED' || next === 'REFUNDED' || next === 'FAILED';
    case 'CAPTURED':
      return next === 'REFUNDED';
    default:
      return false;
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly paymentId: string,
    readonly from: Status,
    readonly to: Status,
  ) {
    super(`платёж ${paymentId}: переход ${from} -> ${to} запрещён`);
    this.name = 'InvalidTransitionError';
  }
}

export type Payment = {
  readonly id: string;
  readonly orderId: string;
  readonly amount: Decimal;
  readonly currency: string;
  readonly status: Status;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export function moveTo(payment: Payment, next: Status, now: Date): Payment {
  if (!canMoveTo(payment.status, next)) throw new InvalidTransitionError(payment.id, payment.status, next);
  return { ...payment, status: next, updatedAt: now };
}
