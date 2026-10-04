import { MigrationInterface, QueryRunner } from 'typeorm';

export class Outbox1700000003000 implements MigrationInterface {
  name = 'Outbox1700000003000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE outbox (
        id             uuid PRIMARY KEY,
        aggregate_id   uuid NOT NULL,
        aggregate_type varchar(64) NOT NULL,
        event_type     varchar(128) NOT NULL,
        event_version  int NOT NULL DEFAULT 1,
        payload        jsonb NOT NULL,
        occurred_at    timestamptz NOT NULL,
        published_at   timestamptz
      )`);
    await q.query('CREATE INDEX idx_outbox_unpublished ON outbox (occurred_at) WHERE published_at IS NULL');
    await q.query('CREATE INDEX idx_outbox_aggregate ON outbox (aggregate_id, occurred_at)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE outbox');
  }
}
