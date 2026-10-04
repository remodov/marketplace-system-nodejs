import { MigrationInterface, QueryRunner } from 'typeorm';

export class Products1700000001000 implements MigrationInterface {
  name = 'Products1700000001000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE products (
        id      uuid PRIMARY KEY,
        title   varchar(255)  NOT NULL,
        price   numeric(12,2) NOT NULL,
        stock   int           NOT NULL,
        version bigint        NOT NULL DEFAULT 0
      )`);
    await q.query('CREATE INDEX idx_products_title ON products (title)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE products');
  }
}
