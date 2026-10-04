import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { invalid } from '../../../core/apperr';
import { cancellationReasonOf } from '../../../core/order/aggregate/order';
import { QueryHandler } from '../../../core/order/query/queries';
import { CreateOrderHandler } from '../../../core/order/usecase/create-order';
import { LifecycleHandler } from '../../../core/order/usecase/lifecycle';
import { Principal, ROLE_ADMIN, ROLE_CUSTOMER, ROLE_SELLER } from '../../../core/security/principal';
import { CurrentPrincipal, Roles } from './auth.guard';
import { idempotencyKeyOf, requestHashOf } from './idempotency';
import { CancelOrderRequest, CreateOrderRequest, OrderDto, PayOrderRequest, ShipOrderRequest, toAddress, toDto, toLine } from './order.dto';

const orderId = new ParseUUIDPipe({ exceptionFactory: () => invalid('VALIDATION_ERROR', 'Идентификатор заказа должен быть UUID') });

@Controller('api/v1/orders')
export class OrderController {
  constructor(
    private readonly create: CreateOrderHandler,
    private readonly lifecycle: LifecycleHandler,
    private readonly queries: QueryHandler,
  ) {}

  @Post()
  @Roles(ROLE_CUSTOMER, ROLE_ADMIN)
  async createOrder(
    @CurrentPrincipal() customer: Principal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateOrderRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrderDto> {
    const result = await this.create.handle({
      customer,
      lines: body.items.map(toLine),
      shippingAddress: toAddress(body.shippingAddress),
      idempotencyKey: idempotencyKeyOf(idempotencyKey),
      requestHash: requestHashOf(body),
    });
    const dto = toDto(result.order);
    if (!result.created) {
      response.status(HttpStatus.OK);
      return dto;
    }
    response.setHeader('Location', `/api/v1/orders/${dto.id}`);
    return dto;
  }

  @Get(':orderId')
  @Roles(ROLE_CUSTOMER, ROLE_ADMIN)
  async getOrder(@Param('orderId', orderId) id: string, @CurrentPrincipal() requester: Principal): Promise<OrderDto> {
    return toDto(await this.queries.getOrder({ orderId: id, requester }));
  }

  @Post(':orderId/confirm')
  @HttpCode(200)
  @Roles(ROLE_CUSTOMER, ROLE_ADMIN)
  async confirmOrder(@Param('orderId', orderId) id: string, @CurrentPrincipal() requester: Principal): Promise<OrderDto> {
    return toDto(await this.lifecycle.confirm({ orderId: id, requester }));
  }

  @Post(':orderId/cancel')
  @HttpCode(200)
  @Roles(ROLE_CUSTOMER, ROLE_ADMIN)
  async cancelOrder(@Param('orderId', orderId) id: string, @CurrentPrincipal() requester: Principal, @Body() body: CancelOrderRequest): Promise<OrderDto> {
    return toDto(await this.lifecycle.cancel({ orderId: id, requester, reason: cancellationReasonOf(body.reasonCode, body.comment) }));
  }

  @Post(':orderId/ship')
  @HttpCode(200)
  @Roles(ROLE_SELLER, ROLE_ADMIN)
  async shipOrder(@Param('orderId', orderId) id: string, @CurrentPrincipal() seller: Principal, @Body() body: ShipOrderRequest): Promise<OrderDto> {
    return toDto(await this.lifecycle.ship({ orderId: id, seller, trackingNumber: body.trackingNumber.trim() }));
  }

  @Post(':orderId/deliver')
  @HttpCode(200)
  @Roles(ROLE_CUSTOMER, ROLE_ADMIN)
  async confirmDelivery(@Param('orderId', orderId) id: string, @CurrentPrincipal() requester: Principal): Promise<OrderDto> {
    return toDto(await this.lifecycle.deliver({ orderId: id, requester }));
  }

  @Post(':orderId/pay')
  @HttpCode(200)
  @Roles(ROLE_ADMIN)
  async payOrder(@Param('orderId', orderId) id: string, @Body() body: PayOrderRequest): Promise<OrderDto> {
    return toDto(await this.lifecycle.pay({ orderId: id, paymentId: body.paymentId.toLowerCase() }));
  }
}
