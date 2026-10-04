import Decimal from 'decimal.js';
import { invalid } from '../../apperr';
import { Principal } from '../../security/principal';
import { Product } from '../aggregate/product';
import { ACTION_PRODUCT_PRICE_CHANGED, Clock, IdGenerator, UnitOfWork } from '../port/out/ports';
import { requireOwnership } from './ownership';

export type ChangeProductPrice = {
  productId: string;
  requester: Principal;
  newPrice: Decimal;
};

export class ChangeProductPriceHandler {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  handle(cmd: ChangeProductPrice): Promise<Product> {
    if (cmd.newPrice.lte(0)) throw invalid('INVALID_PRICE', `Цена должна быть больше нуля, а не ${cmd.newPrice.toString()}`);
    return this.uow.within(async (tx) => {
      const product = await tx.products.byIdForUpdate(cmd.productId);
      requireOwnership(product, cmd.requester);
      const previous = product.state().price;
      product.changePrice(cmd.newPrice, this.clock.now());
      await tx.products.update(product);
      if (cmd.requester.isAdmin()) {
        const changed = product.state();
        await tx.audit.record({
          id: this.ids.newId(),
          actorId: cmd.requester.sub,
          action: ACTION_PRODUCT_PRICE_CHANGED,
          productId: changed.id,
          occurredAt: this.clock.now(),
          metadata: { from: previous.toFixed(2), to: changed.price.toFixed(2), ownerSellerId: changed.sellerId },
        });
      }
      return product;
    });
  }
}
