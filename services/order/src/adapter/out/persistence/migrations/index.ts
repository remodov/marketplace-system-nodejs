import { Orders1700000001000 } from './1700000001000-orders';
import { IdempotencyKeys1700000002000 } from './1700000002000-idempotency-keys';
import { Outbox1700000003000 } from './1700000003000-outbox';
import { Lifecycle1700000004000 } from './1700000004000-lifecycle';

export const migrations = [Orders1700000001000, IdempotencyKeys1700000002000, Outbox1700000003000, Lifecycle1700000004000];
