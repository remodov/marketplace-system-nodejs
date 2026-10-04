import { Principal } from '../../security/principal';
import { Product } from '../aggregate/product';
import { ACTION_PRODUCT_HIDDEN, ACTION_PRODUCT_PUBLISHED, Clock, IdGenerator, UnitOfWork } from '../port/out/ports';
import { requireOwnership } from './ownership';

export type PublishProduct = {
  productId: string;
  requester: Principal;
};

export type HideProduct = {
  productId: string;
  requester: Principal;
};

type Transition = (product: Product, now: Date) => void;

export class ChangeStatusHandler {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  publish(cmd: PublishProduct): Promise<Product> {
    return this.transition(cmd.productId, cmd.requester, ACTION_PRODUCT_PUBLISHED, (product, now) => product.publish(now));
  }

  hide(cmd: HideProduct): Promise<Product> {
    return this.transition(cmd.productId, cmd.requester, ACTION_PRODUCT_HIDDEN, (product, now) => product.hide(now));
  }

  private transition(productId: string, requester: Principal, action: string, move: Transition): Promise<Product> {
    return this.uow.within(async (tx) => {
      const product = await tx.products.byIdForUpdate(productId);
      requireOwnership(product, requester);
      const from = product.state().status;
      move(product, this.clock.now());
      await tx.products.update(product);
      if (requester.isAdmin()) {
        const changed = product.state();
        await tx.audit.record({
          id: this.ids.newId(),
          actorId: requester.sub,
          action,
          productId: changed.id,
          occurredAt: this.clock.now(),
          metadata: { from, to: changed.status, ownerSellerId: changed.sellerId },
        });
      }
      return product;
    });
  }
}
