import type { CancellationReason, Item, Money, Status } from './order';

export type ItemSnapshot = {
  productId: string;
  quantity: number;
  unitPrice: Money;
};

export type OrderEventBase = {
  orderId: string;
  customerId: string;
  sellerId: string;
  occurredAt: Date;
};

export type OrderCreated = OrderEventBase & {
  type: 'OrderCreated';
  total: Money;
  items: ItemSnapshot[];
};

export type OrderConfirmed = OrderEventBase & {
  type: 'OrderConfirmed';
  total: Money;
};

export type OrderPaid = OrderEventBase & {
  type: 'OrderPaid';
  paymentId: string;
  total: Money;
};

export type OrderCancelled = OrderEventBase & {
  type: 'OrderCancelled';
  previousStatus: Status;
  reason: CancellationReason;
  refundId?: string;
};

export type OrderExpired = OrderEventBase & {
  type: 'OrderExpired';
};

export type OrderShipped = OrderEventBase & {
  type: 'OrderShipped';
  trackingNumber: string;
};

export type OrderDelivered = OrderEventBase & {
  type: 'OrderDelivered';
};

export type OrderEvent = OrderCreated | OrderConfirmed | OrderPaid | OrderCancelled | OrderExpired | OrderShipped | OrderDelivered;

export function snapshotsOf(items: Item[]): ItemSnapshot[] {
  return items.map((item) => {
    const { productId, quantity, unitPrice } = item.state();
    return { productId, quantity, unitPrice };
  });
}
