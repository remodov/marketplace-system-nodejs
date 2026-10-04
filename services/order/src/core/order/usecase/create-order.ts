import { invalid, notFound } from '../../apperr';
import { Principal } from '../../security/principal';
import { Address, Item, Order } from '../aggregate/order';
import { CatalogGateway, Clock, IdGenerator, UnitOfWork } from '../port/out/ports';

export type OrderLine = {
  productId: string;
  sellerId: string;
  quantity: number;
};

export type CreateOrder = {
  customer: Principal;
  lines: OrderLine[];
  shippingAddress: Address;
};

export class CreateOrderHandler {
  constructor(
    private readonly catalog: CatalogGateway,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async handle(cmd: CreateOrder): Promise<Order> {
    if (cmd.lines.length === 0) throw invalid('EMPTY_ORDER', 'В заказе нет ни одной позиции');
    requireSingleSeller(cmd.lines);
    const prices = await this.catalog.prices(productIdsOf(cmd.lines));
    const items = cmd.lines.map((line) => {
      const price = prices.get(line.productId);
      if (!price) throw notFound('PRODUCT_NOT_FOUND', `Товар ${line.productId} не найден в каталоге`);
      return Item.create({
        id: this.ids.newId(),
        productId: line.productId,
        sellerId: line.sellerId,
        quantity: line.quantity,
        unitPrice: price,
      });
    });
    const order = Order.create({
      id: this.ids.newId(),
      customerId: cmd.customer.sub,
      items,
      shippingAddress: cmd.shippingAddress,
      now: this.clock.now(),
    });
    await this.uow.within((tx) => tx.orders.insert(order));
    return order;
  }
}

function requireSingleSeller(lines: OrderLine[]): void {
  if (lines.some((line) => line.sellerId !== lines[0].sellerId)) {
    throw invalid('MULTI_SELLER_NOT_SUPPORTED', 'В одном заказе могут быть товары только одного продавца');
  }
}

function productIdsOf(lines: OrderLine[]): string[] {
  return [...new Set(lines.map((line) => line.productId))];
}
