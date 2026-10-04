export class NotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Товар ${id} не найден`);
  }
}

export class InvalidError extends Error {}

export class ConflictError extends Error {
  constructor() {
    super('Товар изменили параллельно, повторите запрос');
  }
}

export class OutOfStockError extends Error {
  constructor(
    readonly id: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Товара ${id} не хватает: просят ${requested}, на складе ${available}`);
  }
}

export function invalid(message: string): InvalidError {
  return new InvalidError(`Недопустимое значение: ${message}`);
}
