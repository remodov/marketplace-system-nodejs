import { Products1700000001000 } from './1700000001000-products';
import { ProductsReserved1700000002000 } from './1700000002000-products-reserved';

// TODO шаг 6: миграция 1700000003000-products-title-trigram с gin-индексом по title
export const migrations = [Products1700000001000, ProductsReserved1700000002000];
