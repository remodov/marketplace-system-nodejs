import { Logger } from '@nestjs/common';
import { ExpireLog } from '../../../core/order/usecase/expire-unpaid';
import { causeChain } from './relay.log';

export class NestExpireLog implements ExpireLog {
  private readonly log = new Logger('expire');

  expired(count: number): void {
    this.log.log(`неоплаченные заказы закрыты по таймауту, ${count}`);
  }

  skipped(orderId: string, error: unknown): void {
    this.log.warn(`заказ ${orderId} не закрыт по таймауту: ${causeChain(error)}`);
  }

  failed(error: unknown): void {
    this.log.warn(`проверка неоплаченных заказов не удалась: ${causeChain(error)}`);
  }
}
