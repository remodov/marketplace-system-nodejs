import Decimal from 'decimal.js';
import { MAX_DISCOUNT_PERCENT, Product } from '../src/product/product.entity';
import { InvalidError, OutOfStockError } from '../src/product/product.errors';

const product = (price: string, stock: number) => Product.create('Товар', new Decimal(price), stock);

test('цена должна быть положительной', () => {
  for (const price of ['0', '-1']) {
    expect(() => product(price, 1)).toThrow(InvalidError);
  }
});

test('скидка вне диапазона отклоняется и не меняет цену', () => {
  const p = product('1000.00', 1);
  for (const percent of [0, -5, MAX_DISCOUNT_PERCENT + 1, 100]) {
    expect(() => p.applyDiscount(percent)).toThrow(InvalidError);
    expect(p.state().price.toString()).toBe('1000');
  }
});

test('скидка на границе допустима', () => {
  const p = product('1000.00', 1);
  p.applyDiscount(MAX_DISCOUNT_PERCENT);
  expect(p.state().price.toString()).toBe('500');
});

test('скидка округляется до копеек', () => {
  const p = product('999.99', 1);
  p.applyDiscount(33);
  expect(p.state().price.toString()).toBe('669.99');
});

test('нулевое изменение остатка отклоняется', () => {
  expect(() => product('10.00', 3).changeStock(0)).toThrow(InvalidError);
});

test('списание ниже нуля отклоняется и не меняет остаток', () => {
  const p = product('10.00', 3);
  expect(() => p.changeStock(-4)).toThrow(OutOfStockError);
  expect(p.state().stock).toBe(3);
});

test('резерв сверх остатка отклоняется с числами в ошибке', () => {
  const p = product('10.00', 3);
  let caught: unknown;
  try {
    p.reserve(4);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(OutOfStockError);
  expect((caught as OutOfStockError).requested).toBe(4);
  expect((caught as OutOfStockError).available).toBe(3);
});

test('состояние меняется только через методы: компилятор не пропускает прямую запись', () => {
  const p = product('10.00', 1);
  const tamper = () => {
    // @ts-expect-error поле price закрыто
    p.price = new Decimal('1.00');
    // @ts-expect-error поле stock закрыто
    p.stock = 100;
  };
  expect(typeof tamper).toBe('function');
  expect(p.state().price.toString()).toBe('10');
});
