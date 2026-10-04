import { MigrationInterface, QueryRunner } from 'typeorm';

export class Products1700000001000 implements MigrationInterface {
  name = 'Products1700000001000';

  async up(q: QueryRunner): Promise<void> {
    await q.query("CREATE TYPE product_status AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN')");
    await q.query(`
      CREATE TABLE products (
        id          uuid PRIMARY KEY,
        title       varchar(255)   NOT NULL,
        description text,
        price       numeric(12,2)  NOT NULL,
        currency    varchar(3)     NOT NULL DEFAULT 'RUB',
        seller_id   uuid           NOT NULL,
        status      product_status NOT NULL,
        created_at  timestamptz    NOT NULL DEFAULT now(),
        updated_at  timestamptz    NOT NULL DEFAULT now(),
        CONSTRAINT products_price_positive CHECK (price > 0)
      )`);
    await q.query('CREATE INDEX idx_products_seller_id ON products (seller_id)');
    await q.query('CREATE INDEX idx_products_status ON products (status)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE products');
    await q.query('DROP TYPE product_status');
  }
}
