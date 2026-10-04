import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { Column, Entity, PrimaryColumn } from 'typeorm';
import { invalid, OutOfStockError } from './product.errors';

const decimalColumn = {
  to: (value: Decimal) => value.toFixed(2),
  from: (value: string) => new Decimal(value),
};

const bigintColumn = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const MAX_DISCOUNT_PERCENT = 50;

export type ProductState = {
  id: string;
  title: string;
  price: Decimal;
  stock: number;
  version: number;
};

@Entity('products')
export class Product {
  @PrimaryColumn({ type: 'uuid' })
  private id!: string;

  @Column({ type: 'varchar', length: 255 })
  private title!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: decimalColumn })
  private price!: Decimal;

  @Column({ type: 'int' })
  private stock!: number;

  @Column({ type: 'bigint', transformer: bigintColumn })
  private version!: number;

  static create(title: string, price: Decimal, stock: number): Product {
    if (title.trim() === '') throw invalid('название не может быть пустым');
    if (price.lte(0)) throw invalid('цена должна быть больше нуля');
    if (stock < 0) throw invalid('остаток не может быть отрицательным');
    const product = new Product();
    product.id = randomUUID();
    product.title = title.trim();
    product.price = price;
    product.stock = stock;
    product.version = 0;
    return product;
  }

  state(): ProductState {
    return { id: this.id, title: this.title, price: this.price, stock: this.stock, version: this.version };
  }

  changePrice(newPrice: Decimal): void {
    if (newPrice.lte(0)) throw invalid('цена должна быть больше нуля');
    this.price = newPrice;
  }

  applyDiscount(percent: number): void {
    // TODO шаг 4: процент от 1 до MAX_DISCOUNT_PERCENT, иначе InvalidError с пределом; цена с округлением до копеек
    void percent;
  }

  changeStock(delta: number): void {
    if (delta === 0) throw invalid('изменение остатка не может быть нулевым');
    if (this.stock + delta < 0) throw new OutOfStockError(this.id, -delta, this.stock);
    this.stock += delta;
  }

  reserve(quantity: number): void {
    if (quantity <= 0) throw invalid('количество должно быть больше нуля');
    if (quantity > this.stock) throw new OutOfStockError(this.id, quantity, this.stock);
    this.stock -= quantity;
  }

  bumpVersion(): void {
    this.version += 1;
  }
}
