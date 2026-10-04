import { MigrationInterface, QueryRunner } from 'typeorm';

export class Lifecycle1700000004000 implements MigrationInterface {
  name = 'Lifecycle1700000004000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE orders
        ADD COLUMN payment_id   uuid,
        ADD COLUMN paid_at      timestamptz,
        ADD COLUMN shipped_at   timestamptz,
        ADD COLUMN delivered_at timestamptz,
        ADD COLUMN closed_at    timestamptz`);
    await q.query("CREATE INDEX idx_orders_pending_payment_updated ON orders (updated_at) WHERE status = 'PENDING_PAYMENT'");
    await q.query(`
      CREATE TABLE processed_events (
        event_id     uuid PRIMARY KEY,
        event_type   varchar(128) NOT NULL,
        processed_at timestamptz NOT NULL
      )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE processed_events');
    await q.query('DROP INDEX idx_orders_pending_payment_updated');
    await q.query(`
      ALTER TABLE orders
        DROP COLUMN closed_at,
        DROP COLUMN delivered_at,
        DROP COLUMN shipped_at,
        DROP COLUMN paid_at,
        DROP COLUMN payment_id`);
  }
}
