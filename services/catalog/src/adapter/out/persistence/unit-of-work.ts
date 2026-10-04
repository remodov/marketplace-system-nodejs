import { DataSource } from 'typeorm';
import { TransactionalPorts, UnitOfWork } from '../../../core/product/port/out/ports';
import { TypeOrmAuditLogger } from './audit.repository';
import { TypeOrmProductRepository } from './product.repository';

export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  within<T>(work: (tx: TransactionalPorts) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work({ products: new TypeOrmProductRepository(manager), audit: new TypeOrmAuditLogger(manager) }),
    );
  }
}
