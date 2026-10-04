export class PeriodicJob {
  private timer?: NodeJS.Timeout;
  private inFlight: Promise<void> = Promise.resolve();
  private stopped = true;

  constructor(private readonly tick: () => Promise<void>) {}

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
}
