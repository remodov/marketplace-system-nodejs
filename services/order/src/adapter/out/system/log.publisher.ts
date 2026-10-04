import { Logger } from '@nestjs/common';
import { ExternalEventPublisher, OutboxMessage } from '../../../core/order/port/out/ports';

export class LogPublisher implements ExternalEventPublisher {
  private readonly log = new Logger('outbox');

  async publish(message: OutboxMessage): Promise<void> {
    this.log.log(`событие ушло бы в брокер: ${message.eventType} ${message.id}, агрегат ${message.aggregateId}, ${message.payload}`);
  }
}
