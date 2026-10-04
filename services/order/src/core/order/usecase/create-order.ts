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

class IdempotencyKeyTaken extends Error {
  constructor() {
    super('ключ идемпотентности занят другим запросом');
    this.name = 'IdempotencyKeyTaken';
  }
}

export class CreateOrderHandler {
  constructor(
    private readonly orders: OrderRepository,
    private readonly catalog: CatalogGateway,
    private readonly keys: IdempotencyKeys,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async handle(cmd: CreateOrder): Promise<CreateOrderResult> {
    if (cmd.lines.length === 0) throw invalid('EMPTY_ORDER', 'В заказе нет ни одной позиции');
    requireSingleSeller(cmd.lines);
    const existing = await this.keys.find(cmd.idempotencyKey, cmd.requestHash);
    if (existing !== undefined) return this.replay(existing);
    const order = await this.build(cmd);
    try {
      await this.uow.within(async (tx) => {
        await tx.orders.insert(order);
        await tx.outbox.append(order.pullEvents());
        const claimed = await tx.keys.claim(cmd.idempotencyKey, cmd.requestHash, order.state().id, order.state().createdAt);
        if (!claimed) throw new IdempotencyKeyTaken();
      });
    } catch (error) {
      if (!(error instanceof IdempotencyKeyTaken)) throw error;
      return this.replayWinner(cmd);
    }
    return { order, created: true };
  }

  private async replayWinner(cmd: CreateOrder): Promise<CreateOrderResult> {
    const winner = await this.keys.find(cmd.idempotencyKey, cmd.requestHash);
    if (winner === undefined) throw new Error(`ключ идемпотентности ${cmd.idempotencyKey} занят, а заказ по нему не найден`);
    return this.replay(winner);
  }

  private async replay(orderId: string): Promise<CreateOrderResult> {
    return { order: await this.orders.byId(orderId), created: false };
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
