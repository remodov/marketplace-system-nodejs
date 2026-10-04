import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CacheModule } from '../cache/cache.module';
import { ProductController } from './product.controller';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';
import { PRODUCT_STORE } from './product.store';

@Module({
  imports: [CacheModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    { provide: PRODUCT_STORE, useFactory: (dataSource: DataSource) => new ProductRepository(dataSource.manager), inject: [DataSource] },
  ],
  exports: [ProductService, PRODUCT_STORE],
})
export class ProductModule {}
