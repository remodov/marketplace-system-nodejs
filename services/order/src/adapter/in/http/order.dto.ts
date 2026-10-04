import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDefined, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Address, Item, LifecycleState, MAX_CANCELLATION_COMMENT_LENGTH, MAX_QUANTITY, Order, Status } from '../../../core/order/aggregate/order';
import { OrderLine } from '../../../core/order/usecase/create-order';

export class AddressRequest {
  @IsOptional()
  @IsString({ message: 'должна быть строкой' })
  country?: string;

  @IsDefined({ message: 'обязательное поле' })
  @IsString({ message: 'должен быть строкой' })
  @Matches(/\S/, { message: 'обязательное поле' })
  city!: string;

  @IsDefined({ message: 'обязательное поле' })
  @IsString({ message: 'должна быть строкой' })
  @Matches(/\S/, { message: 'обязательное поле' })
  street!: string;

  @IsOptional()
  @IsString({ message: 'должен быть строкой' })
  postalCode?: string;

  @IsOptional()
  @IsString({ message: 'должен быть строкой' })
  pickupPoint?: string;
}

export class OrderItemRequest {
  @IsDefined({ message: 'обязательное поле' })
  @IsUUID('all', { message: 'должен быть UUID' })
  productId!: string;

  @IsDefined({ message: 'обязательное поле' })
  @IsUUID('all', { message: 'должен быть UUID' })
  sellerId!: string;

  @IsDefined({ message: 'обязательное поле' })
  @IsInt({ message: `от 1 до ${MAX_QUANTITY}` })
  @Min(1, { message: `от 1 до ${MAX_QUANTITY}` })
  @Max(MAX_QUANTITY, { message: `от 1 до ${MAX_QUANTITY}` })
  quantity!: number;
}

export class CreateOrderRequest {
  @IsDefined({ message: 'нужна хотя бы одна позиция' })
  @IsArray({ message: 'нужна хотя бы одна позиция' })
  @ArrayMinSize(1, { message: 'нужна хотя бы одна позиция' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemRequest)
  items!: OrderItemRequest[];

  @IsDefined({ message: 'нужны город и улица' })
  @ValidateNested()
  @Type(() => AddressRequest)
  shippingAddress!: AddressRequest;
}

export class CancelOrderRequest {
  @IsDefined({ message: 'обязательное поле' })
  @IsString({ message: 'должен быть строкой' })
  @Matches(/\S/, { message: 'обязательное поле' })
  reasonCode!: string;

  @IsOptional()
  @IsString({ message: 'должен быть строкой' })
  @MaxLength(MAX_CANCELLATION_COMMENT_LENGTH, { message: `не длиннее ${MAX_CANCELLATION_COMMENT_LENGTH} символов` })
  comment?: string;
}

export class ShipOrderRequest {
  @IsDefined({ message: 'обязательное поле' })
  @IsString({ message: 'должен быть строкой' })
  @Matches(/\S/, { message: 'обязательное поле' })
  trackingNumber!: string;
}

export class PayOrderRequest {
  @IsDefined({ message: 'обязательное поле' })
  @IsUUID('all', { message: 'должен быть UUID' })
  paymentId!: string;
}

export type AddressDto = {
  country: string;
  city: string;
  street: string;
  postalCode: string;
  pickupPoint?: string;
};

export type OrderItemDto = {
  id: string;
  productId: string;
  sellerId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type OrderDto = {
  id: string;
  customerId: string;
  sellerId: string;
  status: Status;
  items: OrderItemDto[];
  shippingFee: number;
  total: number;
  currency: string;
  shippingAddress: AddressDto;
  paymentId?: string;
  paidAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type LifecycleDto = Pick<OrderDto, 'paymentId' | 'paidAt' | 'shippedAt' | 'deliveredAt' | 'closedAt'>;

export function toLine(item: OrderItemRequest): OrderLine {
  return { productId: item.productId.toLowerCase(), sellerId: item.sellerId.toLowerCase(), quantity: item.quantity };
}

export function toAddress(a: AddressRequest): Address {
  return {
    country: (a.country ?? '').trim(),
    city: a.city.trim(),
    street: a.street.trim(),
    postalCode: (a.postalCode ?? '').trim(),
    pickupPoint: (a.pickupPoint ?? '').trim(),
  };
}

function toAddressDto(a: Address): AddressDto {
  return {
    country: a.country,
    city: a.city,
    street: a.street,
    postalCode: a.postalCode,
    ...(a.pickupPoint === '' ? {} : { pickupPoint: a.pickupPoint }),
  };
}

function toItemDto(item: Item): OrderItemDto {
  const s = item.state();
  return {
    id: s.id,
    productId: s.productId,
    sellerId: s.sellerId,
    quantity: s.quantity,
    unitPrice: s.unitPrice.amount.toNumber(),
    lineTotal: item.lineTotal().amount.toNumber(),
  };
}

export function toDto(order: Order): OrderDto {
  const s = order.state();
  const total = order.total();
  return {
    id: s.id,
    customerId: s.customerId,
    sellerId: s.sellerId,
    status: s.status,
    items: s.items.map(toItemDto),
    shippingFee: s.shippingFee.amount.toNumber(),
    total: total.amount.toNumber(),
    currency: total.currency,
    shippingAddress: toAddressDto(s.shippingAddress),
    ...toLifecycleDto(s.lifecycle),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function toLifecycleDto(lifecycle: LifecycleState): LifecycleDto {
  return {
    ...(lifecycle.paymentId === undefined ? {} : { paymentId: lifecycle.paymentId }),
    ...(lifecycle.paidAt === undefined ? {} : { paidAt: lifecycle.paidAt.toISOString() }),
    ...(lifecycle.shippedAt === undefined ? {} : { shippedAt: lifecycle.shippedAt.toISOString() }),
    ...(lifecycle.deliveredAt === undefined ? {} : { deliveredAt: lifecycle.deliveredAt.toISOString() }),
    ...(lifecycle.closedAt === undefined ? {} : { closedAt: lifecycle.closedAt.toISOString() }),
  };
}
