import { DataSource } from 'typeorm';
import { TransactionalPorts, UnitOfWork } from '../../../core/order/port/out/ports';
import { TypeOrmOrderRepository } from './order.repository';

export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  within<T>(work: (tx: TransactionalPorts) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) => work({ orders: new TypeOrmOrderRepository(manager) }));
  }
}
