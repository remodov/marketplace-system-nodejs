import { Column, Entity, PrimaryColumn } from 'typeorm';
import { STATUSES } from '../../../core/order/aggregate/order';

export type AddressJson = {
  country: string;
  city: string;
  street: string;
  postalCode: string;
  pickupPoint?: string;
};

@Entity('orders')
export class OrderRow {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'uuid', name: 'seller_id' })
  sellerId!: string;

  @Column({ type: 'enum', enum: STATUSES, enumName: 'order_status' })
  status!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'total_amount' })
  totalAmount!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'shipping_fee' })
  shippingFee!: string;

  @Column({ type: 'jsonb', name: 'shipping_address' })
  shippingAddress!: AddressJson;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'uuid', name: 'payment_id', nullable: true })
  paymentId!: string | null;

  @Column({ type: 'timestamptz', name: 'paid_at', nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'shipped_at', nullable: true })
  shippedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'delivered_at', nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'closed_at', nullable: true })
  closedAt!: Date | null;
}

@Entity('order_items')
export class OrderItemRow {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @Column({ type: 'uuid', name: 'seller_id' })
  sellerId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'unit_price' })
  unitPrice!: string;
}
