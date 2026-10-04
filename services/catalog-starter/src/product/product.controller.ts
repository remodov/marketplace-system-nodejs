import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import Decimal from 'decimal.js';
import { BadInputError } from '../http/problem';
import { Card, cardOf } from './product.card';
import { CreateProductDto, ReserveDto, SearchQueryDto } from './product.dto';
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

  private searchOrFilter(query: SearchQueryDto) {
    // TODO шаг 2: если пришёл maxPrice, разобрать его в Decimal и выбрать сценарий cheaperThan
    return this.service.search(query.query ?? '');
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
