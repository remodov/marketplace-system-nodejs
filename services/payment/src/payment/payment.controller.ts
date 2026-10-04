import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import Decimal from 'decimal.js';
import { validationError } from '../httpapi/problem';
import { AuthorizeRequest, PaymentView, toView } from './payment.dto';
import { PaymentService } from './payment.service';

const paymentId = new ParseUUIDPipe({ exceptionFactory: () => validationError('Идентификатор платежа должен быть UUID') });

@Controller('api/v1/payments')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Post()
  async authorize(@Body() body: AuthorizeRequest): Promise<PaymentView> {
    return toView(await this.service.authorize(body.orderId.toLowerCase(), new Decimal(body.amount), body.currency.toUpperCase()));
  }

  @Get(':id')
  async byId(@Param('id', paymentId) id: string): Promise<PaymentView> {
    return toView(await this.service.byId(id));
  }

  @Post(':id/capture')
  @HttpCode(200)
  async capture(@Param('id', paymentId) id: string): Promise<PaymentView> {
    return toView(await this.service.capture(id));
  }

  @Post(':id/refund')
  @HttpCode(200)
  async refund(@Param('id', paymentId) id: string): Promise<PaymentView> {
    return toView(await this.service.refund(id));
  }
}
