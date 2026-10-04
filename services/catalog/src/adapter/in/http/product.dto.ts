import { IsDefined, IsIn, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { Product, Status, STATUSES } from '../../../core/product/aggregate/product';
import { PresignedUpload, ProductPage } from '../../../core/product/port/out/ports';

export class CreateProductRequest {
  @IsDefined({ message: 'обязательное поле' })
  @IsString({ message: 'должно быть строкой' })
  @MinLength(1, { message: 'обязательное поле' })
  title!: string;

  @IsOptional()
  @IsString({ message: 'должно быть строкой' })
  description?: string;

  @IsDefined({ message: 'обязательное поле' })
  @IsNumber({}, { message: 'должна быть числом' })
  @IsPositive({ message: 'должна быть больше нуля' })
  price!: number;

  @IsDefined({ message: 'обязательное поле' })
  @IsString({ message: 'должна быть строкой' })
  @MinLength(1, { message: 'обязательное поле' })
  currency!: string;
}

export class ChangePriceRequest {
  @IsDefined({ message: 'обязательное поле' })
  @IsNumber({}, { message: 'должна быть числом' })
  @IsPositive({ message: 'должна быть больше нуля' })
  price!: number;
}

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class ImageUploadRequest {
  @IsDefined({ message: 'обязательное поле' })
  @IsIn(IMAGE_CONTENT_TYPES, { message: 'image/jpeg, image/png или image/webp' })
  contentType!: string;
}

export class ListMyProductsQuery {
  @IsOptional()
  @IsIn(STATUSES, { message: 'DRAFT, PUBLISHED или HIDDEN' })
  status?: Status;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  sort?: string;
}

export type ProductDto = {
  id: string;
  title: string;
  description?: string;
  price: number;
  currency: string;
  sellerId: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
};

export type ProductPageDto = {
  items: ProductDto[];
  page: number;
  size: number;
  total: number;
};

export type ImageUploadUrlDto = {
  key: string;
  url: string;
  expiresAt: string;
};

export function toDto(product: Product): ProductDto {
  const s = product.state();
  return {
    id: s.id,
    title: s.title,
    ...(s.description === '' ? {} : { description: s.description }),
    price: s.price.toNumber(),
    currency: s.currency,
    sellerId: s.sellerId,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function toPageDto(page: ProductPage): ProductPageDto {
  return { items: page.items.map(toDto), page: page.page, size: page.size, total: page.total };
}

export function toUploadUrlDto(upload: PresignedUpload): ImageUploadUrlDto {
  return { key: upload.key, url: upload.url, expiresAt: upload.expiresAt.toISOString() };
}
