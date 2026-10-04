import Redis from 'ioredis';
import { Cache } from './cache';

export class RedisCache implements Cache {
  private readonly client: Redis;

  constructor(url: string, private readonly ttlSeconds: number) {
    this.client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', this.ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
