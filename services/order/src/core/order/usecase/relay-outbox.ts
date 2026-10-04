import { Clock, ExternalEventPublisher, UnitOfWork } from '../port/out/ports';

export interface RelayLog {
  published(count: number): void;
  failed(error: unknown): void;
}

export class OutboxRelay {
  private timer?: NodeJS.Timeout;
  private inFlight: Promise<void> = Promise.resolve();
  private stopped = true;

  constructor(
    private readonly publisher: ExternalEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly batchSize: number,
    private readonly log: RelayLog,
  ) {}

  async once(): Promise<number> {
    return this.uow.within(async (tx) => {
      const batch = await tx.outbox.unpublished(this.batchSize);
      for (const message of batch) {
        try {
          await this.publisher.publish(message);
        } catch (error) {
          throw new Error(`публикация ${message.eventType} ${message.id}`, { cause: error });
        }
        await tx.outbox.markPublished(message.id, this.clock.now());
      }
      return batch.length;
    });
  }

  run(everyMs: number): void {
    this.stopped = false;
    this.schedule(0, everyMs);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.inFlight;
  }

  private schedule(delayMs: number, everyMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.tick().finally(() => this.schedule(everyMs, everyMs));
    }, delayMs);
  }

  private async tick(): Promise<void> {
    try {
      const published = await this.once();
      if (published > 0) this.log.published(published);
    } catch (error) {
      this.log.failed(error);
    }
  }
}
