import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Response } from 'express';
import { validationError } from '../../../core/apperr';
import { ListFilter, SORT_FIELDS, SortField } from '../../../core/product/port/out/ports';
import { QueryHandler } from '../../../core/product/query/queries';
import { ChangeProductPriceHandler } from '../../../core/product/usecase/change-product-price';
import { ChangeStatusHandler } from '../../../core/product/usecase/change-status';
import { CreateProductHandler } from '../../../core/product/usecase/create-product';
import { RequestImageUploadHandler } from '../../../core/product/usecase/request-image-upload';
import { Principal, ROLE_ADMIN, ROLE_SELLER } from '../../../core/security/principal';
import { CurrentPrincipal, Roles } from './auth.guard';
import {
  ChangePriceRequest,
  CreateProductRequest,
  ImageUploadRequest,
  ImageUploadUrlDto,
  ListMyProductsQuery,
  ListProductsQuery,
  ProductDto,
  ProductPageDto,
  toDto,
  toPageDto,
  toUploadUrlDto,
} from './product.dto';

const productId = new ParseUUIDPipe({ exceptionFactory: () => validationError({ productId: 'должен быть UUID' }) });

@Controller('api/v1/products')
export class ProductController {
  constructor(
    private readonly create: CreateProductHandler,
    private readonly price: ChangeProductPriceHandler,
    private readonly status: ChangeStatusHandler,
    private readonly queries: QueryHandler,
    private readonly upload: RequestImageUploadHandler,
  ) {}

  @Post()
  @Roles(ROLE_SELLER, ROLE_ADMIN)
  async createProduct(
    @CurrentPrincipal() seller: Principal,
    @Body() body: CreateProductRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProductDto> {
    const product = await this.create.handle({
      seller,
      title: body.title,
      description: body.description ?? '',
      price: new Decimal(body.price),
      currency: body.currency,
    });
    const dto = toDto(product);
    response.setHeader('Location', `/api/v1/products/${dto.id}`);
    return dto;
  }

  @Get()
  async listProducts(@Query() query: ListProductsQuery): Promise<ProductPageDto> {
    return toPageDto(await this.queries.listPublished({ filter: filterOf(query) }));
  }

  @Get('my')
  @Roles(ROLE_SELLER, ROLE_ADMIN)
  async listMyProducts(@CurrentPrincipal() seller: Principal, @Query() query: ListMyProductsQuery): Promise<ProductPageDto> {
    const filter: ListFilter = { ...filterOf(query), status: query.status };
    return toPageDto(await this.queries.listMyProducts({ sellerId: seller.sub, filter }));
  }

  @Get(':productId')
  async getProduct(@Param('productId', productId) id: string, @CurrentPrincipal() requester?: Principal): Promise<ProductDto> {
    return toDto(await this.queries.getProduct({ productId: id, requester }));
  }

  @Post(':productId/publish')
  @HttpCode(200)
  @Roles(ROLE_SELLER, ROLE_ADMIN)
  async publishProduct(@Param('productId', productId) id: string, @CurrentPrincipal() requester: Principal): Promise<ProductDto> {
    return toDto(await this.status.publish({ productId: id, requester }));
  }

  @Post(':productId/hide')
  @HttpCode(200)
  @Roles(ROLE_SELLER, ROLE_ADMIN)
  async hideProduct(@Param('productId', productId) id: string, @CurrentPrincipal() requester: Principal): Promise<ProductDto> {
    return toDto(await this.status.hide({ productId: id, requester }));
  }

  @Patch(':productId/price')
  @Roles(ROLE_SELLER, ROLE_ADMIN)
  async changeProductPrice(
    @Param('productId', productId) id: string,
    @CurrentPrincipal() requester: Principal,
    @Body() body: ChangePriceRequest,
  ): Promise<ProductDto> {
    return toDto(await this.price.handle({ productId: id, requester, newPrice: new Decimal(body.price) }));
  }

  @Post(':productId/image-upload-url')
  @HttpCode(200)
  @Roles(ROLE_SELLER, ROLE_ADMIN)
  async requestImageUpload(
    @Param('productId', productId) id: string,
    @CurrentPrincipal() requester: Principal,
    @Body() body: ImageUploadRequest,
  ): Promise<ImageUploadUrlDto> {
    return toUploadUrlDto(await this.upload.handle({ productId: id, requester, contentType: body.contentType }));
  }
}

function filterOf(query: ListProductsQuery): ListFilter {
  return { page: intOr(query.page, 1), size: intOr(query.size, 20), sort: sortOf(query.sort) };
}

function intOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

function sortOf(raw: string | undefined): SortField {
  return SORT_FIELDS.find((field) => field === raw) ?? 'createdAt,desc';
}
