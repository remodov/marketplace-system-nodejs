import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductsReserved1700000002000 implements MigrationInterface {
  name = 'ProductsReserved1700000002000';

  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE products ADD COLUMN reserved int NOT NULL DEFAULT 0');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE products DROP COLUMN reserved');
  }
}
