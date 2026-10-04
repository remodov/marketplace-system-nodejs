import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CACHE, Cache } from '../cache/cache';
import { Product } from './product.entity';
import { PRODUCT_STORE, ProductStore } from './product.store';

@Injectable()
export class ProductService {
  constructor(
    @Inject(PRODUCT_STORE) private readonly store: ProductStore,
    @Inject(CACHE) private readonly cache: Cache,
  ) {}

  search(query: string): Promise<Product[]> {
    const part = query.trim();
    return part === '' ? this.store.all() : this.store.byTitle(part);
  }

  byId(id: string): Promise<Product> {
    return this.store.byId(id);
  }

  async create(title: string, price: Decimal, stock: number): Promise<Product> {
    const product = Product.create(title, price, stock);
    await this.store.insert(product);
    return product;
  }

  async reserve(id: string, quantity: number): Promise<Product> {
    const product = await this.store.byId(id);
    product.reserve(quantity);
    await this.store.update(product);
    return product;
  }
}
