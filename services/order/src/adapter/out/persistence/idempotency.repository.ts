import { EntityManager } from 'typeorm';
import { IdempotencyKeys } from '../../../core/order/port/out/ports';

export class TypeOrmIdempotencyKeys implements IdempotencyKeys {
  constructor(private readonly manager: EntityManager) {}

  // TODO шаг 9: прочитать строку по ключу; хеш другой - конфликт IDEMPOTENCY_KEY_CONFLICT,
  // хеш тот же - id прежнего заказа, строки нет - undefined.
  async find(key: string, requestHash: string): Promise<string | undefined> {
    return undefined;
  }

  // TODO шаг 9: занять ключ одной вставкой с ON CONFLICT DO NOTHING и сказать, удалось ли.
  async claim(key: string, requestHash: string, orderId: string, now: Date): Promise<boolean> {
    return true;
  }
}
