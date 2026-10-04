import { Inject, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CACHE, Cache } from '../cache/cache';
import { Card, cardOf } from './product.card';
import { Product } from './product.entity';
import { PRODUCT_STORE, ProductStore } from './product.store';

@Injectable()
export class ProductService {
  private readonly log = new Logger(ProductService.name);

  constructor(
    @Inject(PRODUCT_STORE) private readonly store: ProductStore,
    @Inject(CACHE) private readonly cache: Cache,
  ) {}

  search(query: string): Promise<Product[]> {
    const part = query.trim();
    return part === '' ? this.store.all() : this.store.byTitle(part);
  }

  cheaperThan(maxPrice: Decimal): Promise<Product[]> {
    return this.store.cheaper(maxPrice);
  }

  byId(id: string): Promise<Product> {
    return this.store.byId(id);
  }

  async card(id: string): Promise<Card> {
    const key = cardKey(id);
    const cached = await this.cache.get<Card>(key).catch((e: unknown) => {
      this.log.warn(`кэш карточек недоступен, читаем из базы: ${String(e)}`);
      return undefined;
    });
    if (cached) return cached;
    const card = cardOf(await this.store.byId(id));
    await this.cache.set(key, card).catch((e: unknown) => this.log.warn(`карточка не попала в кэш: ${String(e)}`));
    return card;
  }

  private async forget(id: string): Promise<void> {
    await this.cache.delete(cardKey(id)).catch((e: unknown) => this.log.warn(`карточка ${id} не сброшена из кэша: ${String(e)}`));
  }

  async create(title: string, price: Decimal, stock: number): Promise<Product> {
    const product = Product.create(title, price, stock);
    await this.store.insert(product);
    return product;
  }

  changePrice(id: string, newPrice: Decimal): Promise<Product> {
    return this.change(id, (p) => p.changePrice(newPrice));
  }

  applyDiscount(id: string, percent: number): Promise<Product> {
    return this.change(id, (p) => p.applyDiscount(percent));
  }

  changeStock(id: string, delta: number): Promise<Product> {
    return this.change(id, (p) => p.changeStock(delta));
  }

  private async change(id: string, command: (product: Product) => void): Promise<Product> {
    const product = await this.store.byId(id);
    command(product);
    await this.store.update(product);
    await this.forget(id);
    return product;
  }

  async reserve(id: string, quantity: number): Promise<Product> {
    const reserved = await this.store.withTx(async (tx) => {
      const product = await tx.byIdForUpdate(id);
      product.reserve(quantity);
      await tx.update(product);
      return product;
    });
    await this.forget(id);
    return reserved;
  }
}

function cardKey(id: string): string {
  return `product-card:${id}`;
}
