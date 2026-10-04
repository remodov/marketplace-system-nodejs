import { notFound } from '../../apperr';
import { Principal } from '../../security/principal';
import { Product } from '../aggregate/product';
import { ListFilter, ProductPage, ProductRepository } from '../port/out/ports';

export type GetProduct = {
  productId: string;
  requester?: Principal;
};

export type ListMyProducts = {
  sellerId: string;
  filter: ListFilter;
};

export type ListPublished = {
  filter: ListFilter;
};

export class QueryHandler {
  constructor(private readonly products: ProductRepository) {}

  async getProduct(q: GetProduct): Promise<Product> {
    const product = await this.products.byId(q.productId);
    if (product.state().status === 'PUBLISHED') return product;
    if (q.requester && (q.requester.isAdmin() || product.ownedBy(q.requester.sub))) return product;
    throw notFound('PRODUCT_NOT_FOUND', 'Продукт не найден');
  }

  listMyProducts(q: ListMyProducts): Promise<ProductPage> {
    return this.products.listBySeller(q.sellerId, q.filter);
  }

  listPublished(q: ListPublished): Promise<ProductPage> {
    return this.products.listPublished(q.filter);
  }
}
