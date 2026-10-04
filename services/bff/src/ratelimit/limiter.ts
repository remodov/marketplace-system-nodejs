import Redis from 'ioredis';

export const WINDOW_SECONDS = 60;

export interface Clock {
  now(): Date;
}

export type Decision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export class Limiter {
  constructor(
    private readonly redis: Redis,
    private readonly perMinute: number,
    private readonly clock: Clock,
  ) {}

  async check(client: string): Promise<Decision> {
    const key = `rate:${client}:${this.currentWindow()}`;
    const used = await this.redis.incr(key);
    if (used === 1) await this.redis.expire(key, WINDOW_SECONDS);
    return { allowed: used <= this.perMinute, remaining: Math.max(this.perMinute - used, 0), retryAfterSeconds: WINDOW_SECONDS };
  }

  private currentWindow(): number {
    return Math.floor(this.clock.now().getTime() / (WINDOW_SECONDS * 1000));
  }
}
