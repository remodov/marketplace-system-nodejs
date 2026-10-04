import Decimal from 'decimal.js';
import CircuitBreaker from 'opossum';
import { Agent, fetch } from 'undici';
import { AppError, notFound, unavailable } from '../../../core/apperr';
import { Money } from '../../../core/order/aggregate/order';
import { CatalogGateway, Prices } from '../../../core/order/port/out/ports';

export type CatalogSettings = {
  baseUrl: string;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
  attempts: number;
  backoffMs: number;
  breakerMinRequests: number;
  breakerOpenForMs: number;
};

const BREAKER_WINDOW_MS = 30_000;
const BREAKER_FAILURE_PERCENTAGE = 50;

type PriceResponse = {
  price: number | string;
  currency: string;
};

export class CatalogClient implements CatalogGateway {
  private readonly settings: CatalogSettings;
  private readonly agent: Agent;
  private readonly breaker: CircuitBreaker<[string[]], Prices>;

  constructor(settings: CatalogSettings) {
    this.settings = {
      ...settings,
      attempts: settings.attempts < 1 ? 1 : settings.attempts,
      requestTimeoutMs: settings.requestTimeoutMs <= 0 ? 1000 : settings.requestTimeoutMs,
    };
    this.agent = new Agent({ connect: { timeout: this.settings.connectTimeoutMs } });
    this.breaker = new CircuitBreaker((productIds: string[]) => this.fetchAll(productIds), {
      name: 'catalog',
      timeout: false,
      rollingCountTimeout: BREAKER_WINDOW_MS,
      resetTimeout: this.settings.breakerOpenForMs,
      volumeThreshold: this.settings.breakerMinRequests,
      errorThresholdPercentage: BREAKER_FAILURE_PERCENTAGE,
      errorFilter: (error: unknown) => error instanceof AppError && error.kind === 'not_found',
    });
  }

  async prices(productIds: string[]): Promise<Prices> {
    try {
      return await this.breaker.fire(productIds);
    } catch (error) {
      if (isBreakerRefusal(error)) throw degraded(error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.breaker.shutdown();
    await this.agent.close();
  }

  private async fetchAll(productIds: string[]): Promise<Prices> {
    const prices: Prices = new Map();
    for (const id of productIds) prices.set(id, await this.fetchWithRetry(id));
    return prices;
  }

  private async fetchWithRetry(productId: string): Promise<Money> {
    let last: unknown;
    for (let attempt = 1; attempt <= this.settings.attempts; attempt++) {
      try {
        return await this.fetchOnce(productId);
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (!(error instanceof TransientError)) throw degraded(error);
        last = error;
      }
      if (attempt < this.settings.attempts) await pause(this.settings.backoffMs * attempt);
    }
    throw degraded(last);
  }

  private async fetchOnce(productId: string): Promise<Money> {
    const response = await this.send(productId);
    if (response.status === 404) {
      await response.body?.cancel();
      throw notFound('PRODUCT_NOT_FOUND', `Товар ${productId} не найден в каталоге`);
    }
    if (response.status >= 500) {
      await response.body?.cancel();
      throw new TransientError(new Error(`каталог ответил ${response.status}`));
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`каталог ответил ${response.status}`);
    }
    const body = (await response.json()) as PriceResponse;
    return Money.of(new Decimal(body.price), body.currency);
  }

  private async send(productId: string) {
    try {
      return await fetch(`${this.settings.baseUrl}/api/v1/products/${productId}`, {
        dispatcher: this.agent,
        signal: AbortSignal.timeout(this.settings.requestTimeoutMs),
      });
    } catch (error) {
      throw new TransientError(error);
    }
  }
}

class TransientError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'TransientError';
  }
}

function isBreakerRefusal(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'EOPENBREAKER' || code === 'ESEMAPHORELOCKED';
}

function degraded(cause: unknown): AppError {
  return unavailable('SERVICE_DEGRADED', 'Каталог временно недоступен', cause);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
