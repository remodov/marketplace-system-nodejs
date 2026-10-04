import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { invalid } from '../../../core/apperr';
import { QueryHandler } from '../../../core/order/query/queries';
import { CreateOrderHandler } from '../../../core/order/usecase/create-order';
import { Principal, ROLE_ADMIN, ROLE_CUSTOMER } from '../../../core/security/principal';
import { CurrentPrincipal, Roles } from './auth.guard';
import { CreateOrderRequest, OrderDto, toAddress, toDto, toLine } from './order.dto';

const orderId = new ParseUUIDPipe({ exceptionFactory: () => invalid('VALIDATION_ERROR', 'Идентификатор заказа должен быть UUID') });

@Controller('api/v1/orders')
export class OrderController {
  constructor(
    private readonly create: CreateOrderHandler,
    private readonly queries: QueryHandler,
  ) {}

  @Post()
  @Roles(ROLE_CUSTOMER, ROLE_ADMIN)
  async createOrder(
    @CurrentPrincipal() customer: Principal,
    @Body() body: CreateOrderRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrderDto> {
    const order = await this.create.handle({
      customer,
      lines: body.items.map(toLine),
      shippingAddress: toAddress(body.shippingAddress),
    });
    const dto = toDto(order);
    response.setHeader('Location', `/api/v1/orders/${dto.id}`);
    return dto;
  }

  @Get(':orderId')
  @Roles(ROLE_CUSTOMER, ROLE_ADMIN)
  async getOrder(@Param('orderId', orderId) id: string, @CurrentPrincipal() requester: Principal): Promise<OrderDto> {
    return toDto(await this.queries.getOrder({ orderId: id, requester }));
  }
}
