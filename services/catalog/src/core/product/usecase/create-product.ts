import Decimal from 'decimal.js';
import { Principal } from '../../security/principal';
import { Product } from '../aggregate/product';
import { Clock, IdGenerator, ProductRepository } from '../port/out/ports';

export type CreateProduct = {
  seller: Principal;
  title: string;
  description: string;
  price: Decimal;
  currency: string;
};

export class CreateProductHandler {
  constructor(
    private readonly products: ProductRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async handle(cmd: CreateProduct): Promise<Product> {
    const product = Product.create({
      id: this.ids.newId(),
      sellerId: cmd.seller.sub,
      title: cmd.title,
      description: cmd.description,
      price: cmd.price,
      currency: cmd.currency,
      now: this.clock.now(),
    });
    await this.products.insert(product);
    return product;
  }
}
