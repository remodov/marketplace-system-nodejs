import { DataSource } from 'typeorm';
import { IdGenerator, TransactionalPorts, UnitOfWork } from '../../../core/order/port/out/ports';
import { TypeOrmIdempotencyKeys } from './idempotency.repository';
import { TypeOrmOrderRepository } from './order.repository';
import { TypeOrmOutbox } from './outbox.repository';

export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ids: IdGenerator,
  ) {}

  within<T>(work: (tx: TransactionalPorts) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work({
        orders: new TypeOrmOrderRepository(manager),
        keys: new TypeOrmIdempotencyKeys(manager),
        outbox: new TypeOrmOutbox(manager, this.ids),
      }),
    );
  }
}
