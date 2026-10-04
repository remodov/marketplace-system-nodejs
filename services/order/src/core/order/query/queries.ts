import { notFound } from '../../apperr';
import { Principal } from '../../security/principal';
import { Order } from '../aggregate/order';
import { OrderRepository } from '../port/out/ports';

export type GetOrder = {
  orderId: string;
  requester: Principal;
};

export class QueryHandler {
  constructor(private readonly orders: OrderRepository) {}

  async getOrder(q: GetOrder): Promise<Order> {
    const order = await this.orders.byId(q.orderId);
    if (!order.ownedBy(q.requester.sub) && !q.requester.isAdmin()) throw notFound('ORDER_NOT_FOUND', 'Заказ не найден');
    return order;
  }
}
