import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import Decimal from 'decimal.js';
import { BadInputError, FieldErrors } from '../http/problem';
import { Card, cardOf } from './product.card';
import { ChangePriceDto, ChangeStockDto, CreateProductDto, ReserveDto, SearchQueryDto } from './product.dto';
import { ProductService } from './product.service';

export const productId = new ParseUUIDPipe({
  exceptionFactory: () => new BadInputError('Идентификатор товара должен быть UUID'),
});

@Controller('products')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Get()
  async search(@Query() query: SearchQueryDto): Promise<Card[]> {
    const found = await this.searchOrFilter(query);
    return found.map(cardOf);
  }

  @Patch(':id/price')
  async changePrice(@Param('id', productId) id: string, @Body() body: ChangePriceDto): Promise<Card> {
    return cardOf(await this.service.changePrice(id, new Decimal(String(body.price))));
  }

  // TODO шаг 4: PATCH :id/discount с телом {"percent": N}

  @Patch(':id/stock')
  async changeStock(@Param('id', productId) id: string, @Body() body: ChangeStockDto): Promise<Card> {
    return cardOf(await this.service.changeStock(id, body.delta));
  }

  private searchOrFilter(query: SearchQueryDto) {
    if (query.maxPrice === undefined) return this.service.search(query.query ?? '');
    const maxPrice = new Decimal(query.maxPrice);
    if (maxPrice.lte(0)) throw new FieldErrors({ maxPrice: 'должна быть положительным числом' });
    return this.service.cheaperThan(maxPrice);
  }

  @Get(':id')
  async byId(@Param('id', productId) id: string): Promise<Card> {
    return cardOf(await this.service.byId(id));
  }

  @Post()
  async create(@Body() body: CreateProductDto): Promise<Card> {
    const created = await this.service.create(body.title, new Decimal(String(body.price)), body.stock);
    return cardOf(created);
  }

  @Post(':id/reserve')
  @HttpCode(200)
  async reserve(@Param('id', productId) id: string, @Body() body: ReserveDto): Promise<Card> {
    return cardOf(await this.service.reserve(id, body.quantity));
  }
}
