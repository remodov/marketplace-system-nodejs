import { MigrationInterface, QueryRunner } from 'typeorm';

export class Notifications1700000001000 implements MigrationInterface {
  name = 'Notifications1700000001000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE processed_events (
        event_id     uuid PRIMARY KEY,
        event_type   varchar(128) NOT NULL,
        processed_at timestamptz NOT NULL
      )`);
    await q.query('CREATE INDEX idx_processed_events_processed_at ON processed_events (processed_at)');
    await q.query(`
      CREATE TABLE notifications (
        id           uuid PRIMARY KEY,
        event_id     uuid NOT NULL,
        event_type   varchar(64) NOT NULL,
        user_id      uuid NOT NULL,
        channel      varchar(16) NOT NULL,
        template_key varchar(128) NOT NULL,
        status       varchar(16) NOT NULL,
        payload      jsonb NOT NULL,
        created_at   timestamptz NOT NULL
      )`);
    await q.query('CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC)');
    await q.query('CREATE INDEX idx_notifications_status_created ON notifications (status, created_at)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE notifications');
    await q.query('DROP TABLE processed_events');
  }
}
