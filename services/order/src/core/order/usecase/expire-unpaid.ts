import { Clock, OrderRepository } from '../port/out/ports';
import { LifecycleHandler } from './lifecycle';
import { PeriodicJob } from './periodic-job';

export interface ExpireLog {
  expired(count: number): void;
  skipped(orderId: string, error: unknown): void;
  failed(error: unknown): void;
}

export class ExpireUnpaid {
  private readonly job = new PeriodicJob(() => this.tick());

  constructor(
    private readonly orders: OrderRepository,
    private readonly lifecycle: LifecycleHandler,
    private readonly clock: Clock,
    private readonly afterMs: number,
    private readonly batchSize: number,
    private readonly log: ExpireLog,
  ) {}

  async once(): Promise<number> {
    const deadline = new Date(this.clock.now().getTime() - this.afterMs);
    const orderIds = await this.orders.pendingPaymentBefore(deadline, this.batchSize);
    let expired = 0;
    for (const orderId of orderIds) {
      try {
        await this.lifecycle.expire({ orderId });
        expired += 1;
      } catch (error) {
        this.log.skipped(orderId, error);
      }
    }
    return expired;
  }

  run(everyMs: number): void {
    this.job.run(everyMs);
  }

  stop(): Promise<void> {
    return this.job.stop();
  }

  private async tick(): Promise<void> {
    try {
      const expired = await this.once();
      if (expired > 0) this.log.expired(expired);
    } catch (error) {
      this.log.failed(error);
    }
  }
}
