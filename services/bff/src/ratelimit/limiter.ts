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
    // TODO шаг 13: счётчик запросов клиента в текущем минутном окне.
    // Ключ должен сам протухать вместе с окном: чистить его отдельной задачей
    // не нужно. И считать надо на каждого клиента, а не на всех сразу.
    return { allowed: true, remaining: this.perMinute, retryAfterSeconds: WINDOW_SECONDS };
  }
}
