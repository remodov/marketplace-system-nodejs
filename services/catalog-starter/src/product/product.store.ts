import { Product } from './product.entity';

export const PRODUCT_STORE = Symbol('PRODUCT_STORE');

export interface ProductStore {
  all(): Promise<Product[]>;
  byTitle(part: string): Promise<Product[]>;
  // TODO шаг 2: выборка товаров не дороже maxPrice
  byId(id: string): Promise<Product>;
  byIdForUpdate(id: string): Promise<Product>;
  insert(product: Product): Promise<void>;
  update(product: Product): Promise<void>;
  withTx<T>(fn: (tx: ProductStore) => Promise<T>): Promise<T>;
}
