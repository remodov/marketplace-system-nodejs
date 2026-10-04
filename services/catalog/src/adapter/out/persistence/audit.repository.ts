import { EntityManager } from 'typeorm';
import { AuditEntry, AuditLogger } from '../../../core/product/port/out/ports';
import { AuditLogRow } from './rows';

export class TypeOrmAuditLogger implements AuditLogger {
  constructor(private readonly manager: EntityManager) {}

  async record(entry: AuditEntry): Promise<void> {
    const row = new AuditLogRow();
    row.id = entry.id;
    row.actorId = entry.actorId;
    row.action = entry.action;
    row.productId = entry.productId;
    row.occurredAt = entry.occurredAt;
    row.metadata = entry.metadata;
    await this.manager.insert(AuditLogRow, row);
  }
}
