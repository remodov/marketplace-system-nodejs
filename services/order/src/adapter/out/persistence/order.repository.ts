import Decimal from 'decimal.js';
import { EntityManager } from 'typeorm';
import { notFound } from '../../../core/apperr';
import { Address, Item, Money, Order, parseStatus } from '../../../core/order/aggregate/order';
import { OrderRepository } from '../../../core/order/port/out/ports';
import { AddressJson, OrderItemRow, OrderRow } from './rows';

export class TypeOrmOrderRepository implements OrderRepository {
  constructor(private readonly manager: EntityManager) {}

  async insert(order: Order): Promise<void> {
    const s = order.state();
    await this.manager.insert(OrderRow, toOrderRow(order));
    await this.manager.insert(
      OrderItemRow,
      s.items.map((item) => toItemRow(s.id, item)),
    );
  }

  async byId(id: string): Promise<Order> {
    const row = await this.manager.findOne(OrderRow, { where: { id } });
    if (!row) throw notFound('ORDER_NOT_FOUND', 'Заказ не найден');
    const items = await this.manager.find(OrderItemRow, { where: { orderId: id }, order: { id: 'ASC' } });
    return toOrder(row, items);
  }
}

function toOrderRow(order: Order): OrderRow {
  const s = order.state();
  const total = order.total();
  const row = new OrderRow();
  row.id = s.id;
  row.customerId = s.customerId;
  row.sellerId = s.sellerId;
  row.status = s.status;
  row.currency = total.currency;
  row.totalAmount = total.amount.toFixed(2);
  row.shippingFee = s.shippingFee.amount.toFixed(2);
  row.shippingAddress = toAddressJson(s.shippingAddress);
  row.createdAt = s.createdAt;
  row.updatedAt = s.updatedAt;
  return row;
}

function toItemRow(orderId: string, item: Item): OrderItemRow {
  const s = item.state();
  const row = new OrderItemRow();
  row.id = s.id;
  row.orderId = orderId;
  row.productId = s.productId;
  row.sellerId = s.sellerId;
  row.quantity = s.quantity;
  row.unitPrice = s.unitPrice.amount.toFixed(2);
  return row;
}

function toAddressJson(a: Address): AddressJson {
  return {
    country: a.country,
    city: a.city,
    street: a.street,
    postalCode: a.postalCode,
    ...(a.pickupPoint === '' ? {} : { pickupPoint: a.pickupPoint }),
  };
}

function toAddress(json: AddressJson): Address {
  return {
    country: json.country,
    city: json.city,
    street: json.street,
    postalCode: json.postalCode,
    pickupPoint: json.pickupPoint ?? '',
  };
}

function toOrder(row: OrderRow, items: OrderItemRow[]): Order {
  const status = parseStatus(row.status);
  if (!status) throw new Error(`статус заказа ${row.id} в базе неизвестен: ${row.status}`);
  return Order.restore({
    id: row.id,
    customerId: row.customerId,
    sellerId: row.sellerId,
    status,
    items: items.map((item) =>
      Item.restore({
        id: item.id,
        productId: item.productId,
        sellerId: item.sellerId,
        quantity: item.quantity,
        unitPrice: Money.of(new Decimal(item.unitPrice), row.currency),
      }),
    ),
    shippingFee: Money.of(new Decimal(row.shippingFee), row.currency),
    shippingAddress: toAddress(row.shippingAddress),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
