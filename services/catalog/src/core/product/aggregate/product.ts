import Decimal from 'decimal.js';
import { conflict, invalid } from '../../apperr';

export type Status = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';

export const STATUSES: readonly Status[] = ['DRAFT', 'PUBLISHED', 'HIDDEN'];

export const SUPPORTED_CURRENCY = 'RUB';

export function parseStatus(raw: string): Status | undefined {
  return STATUSES.find((status) => status === raw);
}

export type ProductState = {
  id: string;
  title: string;
  description: string;
  price: Decimal;
  currency: string;
  sellerId: string;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
};

export type NewProduct = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  price: Decimal;
  currency: string;
  now: Date;
};

export class Product {
  private constructor(private readonly fields: ProductState) {}

  static create(input: NewProduct): Product {
    const title = input.title.trim();
    if (title === '') throw invalid('VALIDATION_ERROR', 'Название не может быть пустым');
    if (input.price.lte(0)) throw invalid('INVALID_PRICE', 'Цена должна быть больше нуля');
    if (input.currency !== SUPPORTED_CURRENCY) throw invalid('INVALID_CURRENCY', 'Поддерживается только валюта RUB');
    return new Product({
      id: input.id,
      sellerId: input.sellerId,
      title,
      description: input.description.trim(),
      price: input.price.toDecimalPlaces(2),
      currency: input.currency,
      status: 'DRAFT',
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(state: ProductState): Product {
    return new Product({ ...state });
  }

  state(): ProductState {
    return { ...this.fields };
  }

  ownedBy(sellerId: string): boolean {
    return this.fields.sellerId === sellerId;
  }

  changePrice(newPrice: Decimal, now: Date): void {
    if (newPrice.lte(0)) throw invalid('INVALID_PRICE', `Цена должна быть больше нуля, а не ${newPrice.toString()}`);
    this.fields.price = newPrice.toDecimalPlaces(2);
    this.fields.updatedAt = now;
  }

  publish(now: Date): void {
    if (this.fields.status !== 'DRAFT' && this.fields.status !== 'HIDDEN') throw transitionError(this.fields.status, 'PUBLISHED');
    this.fields.status = 'PUBLISHED';
    this.fields.updatedAt = now;
  }

  hide(now: Date): void {
    if (this.fields.status !== 'PUBLISHED') throw transitionError(this.fields.status, 'HIDDEN');
    this.fields.status = 'HIDDEN';
    this.fields.updatedAt = now;
  }
}

function transitionError(from: Status, to: Status) {
  return conflict('INVALID_STATE_TRANSITION', `Переход ${from} -> ${to} не разрешён`);
}
