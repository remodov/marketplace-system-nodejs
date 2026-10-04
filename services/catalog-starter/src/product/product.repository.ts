import { EntityManager } from 'typeorm';
import { Product } from './product.entity';
import { ConflictError, NotFoundError } from './product.errors';
import { ProductStore } from './product.store';

export class ProductRepository implements ProductStore {
  constructor(private readonly manager: EntityManager) {}

  all(): Promise<Product[]> {
    return this.query().orderBy('p.title').getMany();
  }

  byTitle(part: string): Promise<Product[]> {
    return this.query().where('p.title ILIKE :part', { part: `%${part}%` }).orderBy('p.title').getMany();
  }

  // TODO шаг 2: запрос с условием по цене и сортировкой по колонке таблицы

  async byId(id: string): Promise<Product> {
    const found = await this.query().where('p.id = :id', { id }).getOne();
    if (!found) throw new NotFoundError(id);
    return found;
  }

  async byIdForUpdate(id: string): Promise<Product> {
    const found = await this.query().setLock('pessimistic_write').where('p.id = :id', { id }).getOne();
    if (!found) throw new NotFoundError(id);
    return found;
  }

  async insert(product: Product): Promise<void> {
    const s = product.state();
    await this.manager.query(
      'INSERT INTO products (id, title, price, stock, version) VALUES ($1, $2, $3::numeric, $4, $5)',
      [s.id, s.title, s.price.toFixed(2), s.stock, s.version],
    );
  }

  async update(product: Product): Promise<void> {
    const s = product.state();
    const [, affected] = (await this.manager.query(
      'UPDATE products SET title = $2, price = $3::numeric, stock = $4, version = version + 1 WHERE id = $1 AND version = $5',
      [s.id, s.title, s.price.toFixed(2), s.stock, s.version],
    )) as [unknown, number];
    if (affected === 0) throw new ConflictError();
    product.bumpVersion();
  }

  withTx<T>(fn: (tx: ProductStore) => Promise<T>): Promise<T> {
    return this.manager.connection.transaction((manager) => fn(new ProductRepository(manager)));
  }

  private query() {
    return this.manager.createQueryBuilder(Product, 'p');
  }
}
