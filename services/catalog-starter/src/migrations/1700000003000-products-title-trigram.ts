import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductsTitleTrigram1700000003000 implements MigrationInterface {
  name = 'ProductsTitleTrigram1700000003000';

  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await q.query('CREATE INDEX idx_products_title_trgm ON products USING gin (title gin_trgm_ops)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX idx_products_title_trgm');
  }
}
