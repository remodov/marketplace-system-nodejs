import { notFound } from '../../apperr';
import { Principal } from '../../security/principal';
import { Product } from '../aggregate/product';

export function requireOwnership(product: Product, requester: Principal): void {
  if (requester.isAdmin() || product.ownedBy(requester.sub)) return;
  throw notFound('OWN_PRODUCT_REQUIRED', 'Продукт не найден');
}
