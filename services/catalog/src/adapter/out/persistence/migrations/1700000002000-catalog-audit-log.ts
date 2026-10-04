import { MigrationInterface, QueryRunner } from 'typeorm';

export class CatalogAuditLog1700000002000 implements MigrationInterface {
  name = 'CatalogAuditLog1700000002000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE catalog_audit_log (
        id          uuid PRIMARY KEY,
        actor_id    uuid        NOT NULL,
        action      varchar(64) NOT NULL,
        product_id  uuid        NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb
      )`);
    await q.query('CREATE INDEX idx_catalog_audit_log_product_id ON catalog_audit_log (product_id)');
    await q.query('CREATE INDEX idx_catalog_audit_log_actor_id ON catalog_audit_log (actor_id)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE catalog_audit_log');
  }
}
