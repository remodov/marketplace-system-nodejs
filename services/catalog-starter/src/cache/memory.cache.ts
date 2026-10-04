import { Cache } from './cache';

type Entry = { value: unknown; expiresAt: number };

export class MemoryCache implements Cache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly ttlSeconds: number) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
