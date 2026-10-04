import { randomUUID } from 'node:crypto';
import { Clock, IdGenerator } from '../../../core/product/port/out/ports';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class RandomIds implements IdGenerator {
  newId(): string {
    return randomUUID();
  }
}
