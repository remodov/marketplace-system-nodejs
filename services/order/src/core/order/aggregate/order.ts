import Decimal from 'decimal.js';
import { conflict, invalid } from '../../apperr';
import { OrderEvent, OrderEventBase, snapshotsOf } from './events';

export const CURRENCY = 'RUB';
export const MAX_QUANTITY = 999;
export const MIN_CONFIRM_AMOUNT = new Decimal(100);
export const MAX_CANCELLATION_COMMENT_LENGTH = 500;

export type Status =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'DISPUTE'
  | 'REFUNDED';

export const STATUSES: readonly Status[] = [
  'DRAFT',
  'PENDING_PAYMENT',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
  'DISPUTE',
  'REFUNDED',
];

export function parseStatus(raw: string): Status | undefined {
  return STATUSES.find((status) => status === raw);
}

export class Money {
  private constructor(
    readonly amount: Decimal,
    readonly currency: string,
  ) {}

  static of(amount: Decimal, currency: string): Money {
    return new Money(amount, currency);
  }

  static rub(amount: Decimal): Money {
    return new Money(amount.toDecimalPlaces(2), CURRENCY);
  }

  add(other: Money): Money {
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  times(n: number): Money {
    return new Money(this.amount.times(n), this.currency);
  }
}

export type Address = {
  country: string;
  city: string;
  street: string;
  postalCode: string;
  pickupPoint: string;
};

export type CancellationReason = {
  code: string;
  comment: string;
};

export function cancellationReasonOf(code: string, comment = ''): CancellationReason {
  const normalized = code.trim().toUpperCase();
  if (normalized === '') throw invalid('VALIDATION_ERROR', 'Нужен код причины отмены');
  if ([...comment].length > MAX_CANCELLATION_COMMENT_LENGTH) {
    throw invalid('VALIDATION_ERROR', `Комментарий к отмене не длиннее ${MAX_CANCELLATION_COMMENT_LENGTH} символов`);
  }
  return { code: normalized, comment };
}

export type LifecycleState = {
  paymentId?: string;
  paidAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  closedAt?: Date;
};

export type ItemState = {
  id: string;
  productId: string;
  sellerId: string;
  quantity: number;
  unitPrice: Money;
};

export class Item {
  private constructor(private readonly fields: ItemState) {}

  static create(input: ItemState): Item {
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_QUANTITY) {
      throw invalid('VALIDATION_ERROR', `Количество должно быть от 1 до ${MAX_QUANTITY}`);
    }
    if (input.unitPrice.amount.isNegative() || input.unitPrice.currency !== CURRENCY) {
      throw invalid('INVALID_PRICE', 'Цена позиции должна быть неотрицательной в рублях');
    }
    return new Item({ ...input, unitPrice: Money.rub(input.unitPrice.amount) });
  }

  static restore(state: ItemState): Item {
    return new Item({ ...state });
  }

  state(): ItemState {
    return { ...this.fields };
  }

  lineTotal(): Money {
    return this.fields.unitPrice.times(this.fields.quantity);
  }
}

export type OrderState = {
  id: string;
  customerId: string;
  sellerId: string;
  status: Status;
  items: Item[];
  shippingFee: Money;
  shippingAddress: Address;
  createdAt: Date;
  updatedAt: Date;
  lifecycle: LifecycleState;
};

export type NewOrder = {
  id: string;
  customerId: string;
  items: Item[];
  shippingAddress: Address;
  now: Date;
};

export class Order {
  private readonly pending: OrderEvent[] = [];

  private constructor(private readonly fields: OrderState) {}

  static create(input: NewOrder): Order {
    if (input.items.length === 0) throw invalid('EMPTY_ORDER', 'В заказе нет ни одной позиции');
    const sellerId = input.items[0].state().sellerId;
    const seen = new Set<string>();
    for (const item of input.items) {
      const { sellerId: itemSeller, productId } = item.state();
      if (itemSeller !== sellerId) {
        throw invalid('MULTI_SELLER_NOT_SUPPORTED', 'В одном заказе могут быть товары только одного продавца');
      }
      if (seen.has(productId)) throw invalid('VALIDATION_ERROR', `Товар ${productId} повторяется в позициях заказа`);
      seen.add(productId);
    }
    const order = new Order({
      id: input.id,
      customerId: input.customerId,
      sellerId,
      status: 'DRAFT',
      items: [...input.items],
      shippingFee: Money.rub(new Decimal(0)),
      shippingAddress: input.shippingAddress,
      createdAt: input.now,
      updatedAt: input.now,
      lifecycle: {},
    });
    order.register({ type: 'OrderCreated', ...order.base(input.now), total: order.total(), items: snapshotsOf(input.items) });
    return order;
  }

  static restore(state: OrderState): Order {
    return new Order({ ...state, items: [...state.items], lifecycle: { ...state.lifecycle } });
  }

  state(): OrderState {
    return { ...this.fields, items: [...this.fields.items], lifecycle: { ...this.fields.lifecycle } };
  }

  total(): Money {
    return this.fields.items.reduce((sum, item) => sum.add(item.lineTotal()), Money.rub(new Decimal(0))).add(this.fields.shippingFee);
  }

  ownedBy(customerId: string): boolean {
    return this.fields.customerId === customerId;
  }

  soldBy(sellerId: string): boolean {
    return this.fields.sellerId === sellerId;
  }

  isPaidWith(paymentId: string): boolean {
    return this.fields.status === 'PAID' && this.fields.lifecycle.paymentId === paymentId;
  }

  refundablePaymentId(): string {
    this.require('PAID', 'вернуть деньги');
    const paymentId = this.fields.lifecycle.paymentId;
    if (paymentId === undefined) throw new Error(`у оплаченного заказа ${this.fields.id} нет идентификатора платежа`);
    return paymentId;
  }

  confirm(now: Date): void {
    this.require('DRAFT', 'подтвердить');
    if (this.fields.items.length === 0) throw invalid('EMPTY_ORDER', 'В заказе нет ни одной позиции');
    const total = this.total();
    if (total.amount.lessThan(MIN_CONFIRM_AMOUNT)) {
      throw invalid('ORDER_BELOW_MINIMUM', `Сумма заказа ${total.amount.toFixed(2)} меньше минимальной ${MIN_CONFIRM_AMOUNT.toFixed(2)}`);
    }
    this.moveTo('PENDING_PAYMENT', now);
    this.register({ type: 'OrderConfirmed', ...this.base(now), total });
  }

  markPaid(paymentId: string, now: Date): void {
    this.require('PENDING_PAYMENT', 'оплатить');
    this.moveTo('PAID', now);
    this.fields.lifecycle.paymentId = paymentId;
    this.fields.lifecycle.paidAt = now;
    this.register({ type: 'OrderPaid', ...this.base(now), paymentId, total: this.total() });
  }

  cancel(reason: CancellationReason, now: Date): void {
    if (this.fields.status !== 'DRAFT' && this.fields.status !== 'PENDING_PAYMENT') throw this.invalidState('отменить без возврата');
    const previousStatus = this.fields.status;
    this.moveTo('CANCELLED', now);
    this.fields.lifecycle.closedAt = now;
    this.register({ type: 'OrderCancelled', ...this.base(now), previousStatus, reason });
  }

  cancelAfterPayment(reason: CancellationReason, refundId: string, now: Date): void {
    this.require('PAID', 'отменить с возвратом');
    const previousStatus = this.fields.status;
    this.moveTo('CANCELLED', now);
    this.fields.lifecycle.closedAt = now;
    this.register({ type: 'OrderCancelled', ...this.base(now), previousStatus, reason, refundId });
  }

  expire(now: Date): void {
    this.require('PENDING_PAYMENT', 'закрыть по таймауту');
    this.moveTo('EXPIRED', now);
    this.fields.lifecycle.closedAt = now;
    this.register({ type: 'OrderExpired', ...this.base(now) });
  }

  markShipped(trackingNumber: string, now: Date): void {
    if (trackingNumber.trim() === '') throw invalid('VALIDATION_ERROR', 'Нужен трек-номер отправления');
    this.require('PAID', 'передать в доставку');
    this.moveTo('SHIPPED', now);
    this.fields.lifecycle.shippedAt = now;
    this.register({ type: 'OrderShipped', ...this.base(now), trackingNumber });
  }

  confirmDelivery(now: Date): void {
    this.require('SHIPPED', 'подтвердить получение');
    this.moveTo('DELIVERED', now);
    this.fields.lifecycle.deliveredAt = now;
    this.register({ type: 'OrderDelivered', ...this.base(now) });
  }

  pullEvents(): OrderEvent[] {
    return this.pending.splice(0);
  }

  private require(expected: Status, action: string): void {
    if (this.fields.status !== expected) throw this.invalidState(action);
  }

  private invalidState(action: string) {
    return conflict('ORDER_INVALID_STATE', `Заказ в статусе ${this.fields.status} нельзя ${action}`);
  }

  private moveTo(next: Status, now: Date): void {
    this.fields.status = next;
    this.fields.updatedAt = now;
  }

  private base(now: Date): OrderEventBase {
    return { orderId: this.fields.id, customerId: this.fields.customerId, sellerId: this.fields.sellerId, occurredAt: now };
  }

  private register(event: OrderEvent): void {
    this.pending.push(event);
  }
}
