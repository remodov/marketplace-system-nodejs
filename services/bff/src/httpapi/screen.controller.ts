import { Controller, Get, Headers, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../ratelimit/rate-limit.guard';
import { OrderScreen, ScreenAssembler } from '../screen/screen.assembler';
import { validationError } from './problem';

const orderId = new ParseUUIDPipe({ exceptionFactory: () => validationError('orderId должен быть UUID') });

@Controller('api/v1/screens')
@UseGuards(RateLimitGuard)
export class ScreenController {
  constructor(private readonly screens: ScreenAssembler) {}

  @Get('order/:orderId')
  orderScreen(@Param('orderId', orderId) id: string, @Headers('authorization') authorization?: string): Promise<OrderScreen> {
    return this.screens.assemble(id, authorization);
  }
}
