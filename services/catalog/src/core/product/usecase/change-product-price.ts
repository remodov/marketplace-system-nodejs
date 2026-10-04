import Decimal from 'decimal.js';
import { Principal } from '../../security/principal';
import { Product } from '../aggregate/product';
import { Clock, IdGenerator, UnitOfWork } from '../port/out/ports';

export type ChangeProductPrice = {
  productId: string;
  requester: Principal;
  newPrice: Decimal;
};

export class ChangeProductPriceHandler {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  // TODO шаг 7: отклонить цену не больше нуля кодом INVALID_PRICE, внутри единицы работы загрузить товар
  // под блокировкой, проверить владение, сменить цену методом агрегата, сохранить, для администратора
  // записать PRODUCT_PRICE_CHANGED в журнал.
  handle(cmd: ChangeProductPrice): Promise<Product> {
    void cmd;
    void this.clock;
    void this.ids;
    void this.uow;
    throw new Error('TODO шаг 7: смена цены ещё не реализована');
  }
}
