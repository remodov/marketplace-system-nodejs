import Decimal from 'decimal.js';
import { Agent, fetch } from 'undici';
import { notFound } from '../../../core/apperr';
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

type PriceResponse = {
  price: number | string;
  currency: string;
};

export class CatalogClient implements CatalogGateway {
  private readonly agent: Agent;

  // TODO шаг 8: таймаут соединения в Agent и размыкатель opossum с порогом из настроек;
  // товар, которого нет, размыкатель за отказ считать не должен.
  constructor(private readonly settings: CatalogSettings) {
    this.agent = new Agent();
  }

  // TODO шаг 8: обход товаров под размыкателем; открытый размыкатель и исчерпанные
  // попытки уходят наружу как SERVICE_DEGRADED, а не как ошибка клиента.
  async prices(productIds: string[]): Promise<Prices> {
    const prices: Prices = new Map();
    for (const id of productIds) prices.set(id, await this.fetchOnce(id));
    return prices;
  }

  async close(): Promise<void> {
    await this.agent.close();
  }

  // TODO шаг 8: таймаут на запрос через AbortSignal и повтор с паузой; повторять только
  // сетевые ошибки и 5xx, 404 оставлять PRODUCT_NOT_FOUND без повтора.
  private async fetchOnce(productId: string): Promise<Money> {
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(`${this.settings.baseUrl}/api/v1/products/${productId}`, { dispatcher: this.agent });
    } catch (error) {
      throw new Error(`каталог: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    if (response.status === 404) {
      await response.body?.cancel();
      throw notFound('PRODUCT_NOT_FOUND', `Товар ${productId} не найден в каталоге`);
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`каталог ответил ${response.status}`);
    }
    const body = (await response.json()) as PriceResponse;
    return Money.of(new Decimal(body.price), body.currency);
  }
}
