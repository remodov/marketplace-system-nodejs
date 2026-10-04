import { Logger } from '@nestjs/common';
import { RelayLog } from '../../../core/order/usecase/relay-outbox';

export class NestRelayLog implements RelayLog {
  private readonly log = new Logger('outbox');

  published(count: number): void {
    this.log.log(`relay: события отправлены, ${count}`);
  }

  failed(error: unknown): void {
    this.log.warn(`relay: пачка не отправлена, повторим на следующем круге: ${causeChain(error)}`);
  }
}

export function causeChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    if (parts[parts.length - 1] !== current.message) parts.push(current.message);
    current = current.cause;
  }
  return parts.length === 0 ? String(error) : parts.join(': ');
}
