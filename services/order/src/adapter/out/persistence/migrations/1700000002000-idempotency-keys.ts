import { MigrationInterface, QueryRunner } from 'typeorm';

export class IdempotencyKeys1700000002000 implements MigrationInterface {
  name = 'IdempotencyKeys1700000002000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE idempotency_keys (
        idempotency_key varchar(128) PRIMARY KEY,
        request_hash    varchar(64) NOT NULL,
        order_id        uuid NOT NULL REFERENCES orders (id),
        created_at      timestamptz NOT NULL
      )`);
    await q.query('CREATE INDEX idx_idempotency_keys_created ON idempotency_keys (created_at)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE idempotency_keys');
  }
}
