import { invalid, notFound } from '../../apperr';
import { Principal } from '../../security/principal';
import { Address, Item, Order } from '../aggregate/order';
import { CatalogGateway, Clock, IdempotencyKeys, IdGenerator, OrderRepository, UnitOfWork } from '../port/out/ports';

export type OrderLine = {
  productId: string;
  sellerId: string;
  quantity: number;
};

export type CreateOrder = {
  customer: Principal;
  lines: OrderLine[];
  shippingAddress: Address;
  idempotencyKey: string;
  requestHash: string;
};

export type CreateOrderResult = {
  order: Order;
  created: boolean;
};

export class CreateOrderHandler {
  constructor(
    private readonly orders: OrderRepository,
    private readonly catalog: CatalogGateway,
    private readonly keys: IdempotencyKeys,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  // TODO шаг 9: до работы спросить у keys прежний заказ по ключу и хешу (конфликт
  // хеша уходит наружу как есть), после сборки заказа записать его и занять ключ в
  // одной транзакции; если ключ занять не удалось, вернуть чужой заказ с created: false.
  async handle(cmd: CreateOrder): Promise<CreateOrderResult> {
    if (cmd.lines.length === 0) throw invalid('EMPTY_ORDER', 'В заказе нет ни одной позиции');
    requireSingleSeller(cmd.lines);
    const order = await this.build(cmd);
    await this.uow.within((tx) => tx.orders.insert(order));
    return { order, created: true };
  }

  private async build(cmd: CreateOrder): Promise<Order> {
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
    return Order.create({
      id: this.ids.newId(),
      customerId: cmd.customer.sub,
      items,
      shippingAddress: cmd.shippingAddress,
      now: this.clock.now(),
    });
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
