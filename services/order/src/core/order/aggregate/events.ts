import type { Item, Money } from './order';

export type ItemSnapshot = {
  productId: string;
  quantity: number;
  unitPrice: Money;
};

export type OrderCreated = {
  type: 'OrderCreated';
  orderId: string;
  customerId: string;
  sellerId: string;
  total: Money;
  items: ItemSnapshot[];
  occurredAt: Date;
};

export type OrderEvent = OrderCreated;

export function snapshotsOf(items: Item[]): ItemSnapshot[] {
  return items.map((item) => {
    const { productId, quantity, unitPrice } = item.state();
    return { productId, quantity, unitPrice };
  });
}
