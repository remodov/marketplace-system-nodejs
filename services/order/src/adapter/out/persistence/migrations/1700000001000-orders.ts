import { MigrationInterface, QueryRunner } from 'typeorm';

export class Orders1700000001000 implements MigrationInterface {
  name = 'Orders1700000001000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE order_status AS ENUM (
        'DRAFT', 'PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED',
        'COMPLETED', 'EXPIRED', 'CANCELLED', 'DISPUTE', 'REFUNDED'
      )`);
    await q.query(`
      CREATE TABLE orders (
        id               uuid PRIMARY KEY,
        customer_id      uuid NOT NULL,
        seller_id        uuid NOT NULL,
        status           order_status NOT NULL,
        currency         char(3) NOT NULL DEFAULT 'RUB',
        total_amount     numeric(12,2) NOT NULL CHECK (total_amount >= 0),
        shipping_fee     numeric(12,2) NOT NULL CHECK (shipping_fee >= 0),
        shipping_address jsonb NOT NULL,
        created_at       timestamptz NOT NULL,
        updated_at       timestamptz NOT NULL
      )`);
    await q.query(`
      CREATE TABLE order_items (
        id         uuid PRIMARY KEY,
        order_id   uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
        product_id uuid NOT NULL,
        seller_id  uuid NOT NULL,
        quantity   int NOT NULL CHECK (quantity > 0 AND quantity <= 999),
        unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
        CONSTRAINT order_items_product_seller_unique UNIQUE (order_id, product_id, seller_id)
      )`);
    await q.query('CREATE INDEX idx_orders_customer_status_created ON orders (customer_id, status, created_at DESC)');
    await q.query('CREATE INDEX idx_orders_seller_status_created ON orders (seller_id, status, created_at DESC)');
    await q.query('CREATE INDEX idx_order_items_product ON order_items (product_id)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE order_items');
    await q.query('DROP TABLE orders');
    await q.query('DROP TYPE order_status');
  }
}
