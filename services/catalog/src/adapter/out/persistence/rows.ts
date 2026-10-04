import { Column, Entity, PrimaryColumn } from 'typeorm';
import { STATUSES } from '../../../core/product/aggregate/product';

@Entity('products')
export class ProductRow {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'uuid', name: 'seller_id' })
  sellerId!: string;

  @Column({ type: 'enum', enum: STATUSES, enumName: 'product_status' })
  status!: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}

@Entity('catalog_audit_log')
export class AuditLogRow {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid', name: 'actor_id' })
  actorId!: string;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  @Column({ type: 'jsonb' })
  metadata!: Record<string, string>;
}
