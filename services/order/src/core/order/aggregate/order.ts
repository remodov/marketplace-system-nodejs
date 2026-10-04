import Decimal from 'decimal.js';
import { invalid } from '../../apperr';
import { OrderEvent, snapshotsOf } from './events';

export const CURRENCY = 'RUB';
export const MAX_QUANTITY = 999;

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
    });
    order.pending.push({
      type: 'OrderCreated',
      orderId: input.id,
      customerId: input.customerId,
      sellerId,
      total: order.total(),
      items: snapshotsOf(input.items),
      occurredAt: input.now,
    });
    return order;
  }

  static restore(state: OrderState): Order {
    return new Order({ ...state, items: [...state.items] });
  }

  state(): OrderState {
    return { ...this.fields, items: [...this.fields.items] };
  }

  total(): Money {
    return this.fields.items.reduce((sum, item) => sum.add(item.lineTotal()), Money.rub(new Decimal(0))).add(this.fields.shippingFee);
  }

  ownedBy(customerId: string): boolean {
    return this.fields.customerId === customerId;
  }

  pullEvents(): OrderEvent[] {
    return this.pending.splice(0);
  }
}
