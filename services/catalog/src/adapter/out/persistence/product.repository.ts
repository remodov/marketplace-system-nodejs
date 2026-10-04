import Decimal from 'decimal.js';
import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { notFound } from '../../../core/apperr';
import { parseStatus, Product } from '../../../core/product/aggregate/product';
import { ListFilter, ProductPage, ProductRepository, SortField } from '../../../core/product/port/out/ports';
import { ProductRow } from './rows';

const orderBy: Record<SortField, Record<string, 'ASC' | 'DESC'>> = {
  'createdAt,desc': { 'p.createdAt': 'DESC', 'p.id': 'ASC' },
  'createdAt,asc': { 'p.createdAt': 'ASC', 'p.id': 'ASC' },
  'price,asc': { 'p.price': 'ASC', 'p.id': 'ASC' },
  'price,desc': { 'p.price': 'DESC', 'p.id': 'ASC' },
  'title,asc': { 'p.title': 'ASC', 'p.id': 'ASC' },
};

export class TypeOrmProductRepository implements ProductRepository {
  constructor(private readonly manager: EntityManager) {}

  async byId(id: string): Promise<Product> {
    return toProduct(await this.query().where('p.id = :id', { id }).getOne(), id);
  }

  async byIdForUpdate(id: string): Promise<Product> {
    return toProduct(await this.query().setLock('pessimistic_write').where('p.id = :id', { id }).getOne(), id);
  }

  async insert(product: Product): Promise<void> {
    await this.manager.insert(ProductRow, toRow(product));
  }

  async update(product: Product): Promise<void> {
    const row = toRow(product);
    const result = await this.manager.update(ProductRow, { id: row.id }, {
      title: row.title,
      description: row.description,
      price: row.price,
      status: row.status,
      updatedAt: row.updatedAt,
    });
    if (result.affected === 0) throw productNotFound(row.id);
  }

  listBySeller(sellerId: string, filter: ListFilter): Promise<ProductPage> {
    const query = this.query().where('p.sellerId = :sellerId', { sellerId });
    if (filter.status) query.andWhere('p.status = :status', { status: filter.status });
    return this.list(query, filter);
  }

  listPublished(filter: ListFilter): Promise<ProductPage> {
    return this.list(this.query().where('p.status = :status', { status: 'PUBLISHED' }), filter);
  }

  private async list(query: SelectQueryBuilder<ProductRow>, filter: ListFilter): Promise<ProductPage> {
    const page = filter.page < 1 ? 1 : filter.page;
    const size = filter.size < 1 || filter.size > 100 ? 20 : filter.size;
    const [rows, total] = await query
      .orderBy(orderBy[filter.sort] ?? orderBy['createdAt,desc'])
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();
    return { items: rows.map((row) => toProduct(row, row.id)), page, size, total };
  }

  private query() {
    return this.manager.createQueryBuilder(ProductRow, 'p');
  }
}

function productNotFound(id: string) {
  return notFound('PRODUCT_NOT_FOUND', `Продукт ${id} не найден`);
}

function toProduct(row: ProductRow | null, id: string): Product {
  if (!row) throw productNotFound(id);
  const status = parseStatus(row.status);
  if (!status) throw new Error(`статус товара ${row.id} в базе неизвестен: ${row.status}`);
  return Product.restore({
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    price: new Decimal(row.price),
    currency: row.currency,
    sellerId: row.sellerId,
    status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toRow(product: Product): ProductRow {
  const s = product.state();
  const row = new ProductRow();
  row.id = s.id;
  row.title = s.title;
  row.description = s.description === '' ? null : s.description;
  row.price = s.price.toFixed(2);
  row.currency = s.currency;
  row.sellerId = s.sellerId;
  row.status = s.status;
  row.createdAt = s.createdAt;
  row.updatedAt = s.updatedAt;
  return row;
}
