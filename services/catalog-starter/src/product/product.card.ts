import { Product } from './product.entity';

export type Card = {
  id: string;
  title: string;
  price: number;
  stock: number;
  reserved: number;
  available: number;
};

export function cardOf(product: Product): Card {
  const s = product.state();
  return { id: s.id, title: s.title, price: s.price.toNumber(), stock: s.stock, reserved: s.reserved, available: product.available() };
}
