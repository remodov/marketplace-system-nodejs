import { notFound } from '../../apperr';
import { Principal } from '../../security/principal';
import { CancellationReason, Order } from '../aggregate/order';
import { Clock, PaymentGateway, TransactionalPorts, UnitOfWork } from '../port/out/ports';

export type ConfirmOrder = {
  orderId: string;
  requester: Principal;
};

export type PayOrder = {
  orderId: string;
  paymentId: string;
};

export type CancelOrder = {
  orderId: string;
  requester: Principal;
  reason: CancellationReason;
};

export type ExpireOrder = {
  orderId: string;
};

export type MarkShipped = {
  orderId: string;
  seller: Principal;
  trackingNumber: string;
};

export type ConfirmDelivery = {
  orderId: string;
  requester: Principal;
};

type Outcome = 'changed' | 'unchanged';

type Transition = (order: Order) => Promise<Outcome> | Outcome;

export class LifecycleHandler {
  constructor(
    private readonly payment: PaymentGateway,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  confirm(cmd: ConfirmOrder): Promise<Order> {
    return this.transition(cmd.orderId, (order) => {
      requireVisible(order, cmd.requester);
      order.confirm(this.clock.now());
      return 'changed';
    });
  }

  pay(cmd: PayOrder): Promise<Order> {
    return this.transition(cmd.orderId, (order) => this.applyPayment(order, cmd));
  }

  payFromEvent(eventId: string, eventType: string, cmd: PayOrder): Promise<boolean> {
    return this.uow.within(async (tx) => {
      const fresh = await tx.processed.markProcessed(eventId, eventType, this.clock.now());
      if (!fresh) return false;
      await this.applyWithin(tx, cmd.orderId, (order) => this.applyPayment(order, cmd));
      return true;
    });
  }

  cancel(cmd: CancelOrder): Promise<Order> {
    return this.transition(cmd.orderId, async (order): Promise<Outcome> => {
      requireVisible(order, cmd.requester);
      const now = this.clock.now();
      if (order.state().status !== 'PAID') {
        order.cancel(cmd.reason, now);
        return 'changed';
      }
      const orderId = order.state().id;
      const refundId = await this.payment.requestRefund({
        orderId,
        paymentId: order.refundablePaymentId(),
        amount: order.total(),
        idempotencyKey: `refund-${orderId}`,
      });
      order.cancelAfterPayment(cmd.reason, refundId, now);
      return 'changed';
    });
  }

  expire(cmd: ExpireOrder): Promise<Order> {
    return this.transition(cmd.orderId, (order) => {
      if (order.state().status !== 'PENDING_PAYMENT') return 'unchanged';
      order.expire(this.clock.now());
      return 'changed';
    });
  }

  ship(cmd: MarkShipped): Promise<Order> {
    return this.transition(cmd.orderId, (order) => {
      if (!order.soldBy(cmd.seller.sub) && !cmd.seller.isAdmin()) throw orderNotFound();
      order.markShipped(cmd.trackingNumber, this.clock.now());
      return 'changed';
    });
  }

  deliver(cmd: ConfirmDelivery): Promise<Order> {
    return this.transition(cmd.orderId, (order) => {
      requireVisible(order, cmd.requester);
      order.confirmDelivery(this.clock.now());
      return 'changed';
    });
  }

  private applyPayment(order: Order, cmd: PayOrder): Outcome {
    if (order.isPaidWith(cmd.paymentId)) return 'unchanged';
    order.markPaid(cmd.paymentId, this.clock.now());
    return 'changed';
  }

  private transition(orderId: string, apply: Transition): Promise<Order> {
    return this.uow.within((tx) => this.applyWithin(tx, orderId, apply));
  }

  private async applyWithin(tx: TransactionalPorts, orderId: string, apply: Transition): Promise<Order> {
    const order = await tx.orders.byIdForUpdate(orderId);
    if ((await apply(order)) === 'unchanged') return order;
    await tx.orders.update(order);
    await tx.outbox.append(order.pullEvents());
    return order;
  }
}

function requireVisible(order: Order, requester: Principal): void {
  if (!order.ownedBy(requester.sub) && !requester.isAdmin()) throw orderNotFound();
}

function orderNotFound() {
  return notFound('ORDER_NOT_FOUND', 'Заказ не найден');
}
