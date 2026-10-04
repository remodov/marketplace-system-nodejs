import { OrderEvent } from '../../aggregate/events';
import { Money, Order } from '../../aggregate/order';

export interface OrderRepository {
  insert(order: Order): Promise<void>;
  byId(id: string): Promise<Order>;
  byIdForUpdate(id: string): Promise<Order>;
  update(order: Order): Promise<void>;
  pendingPaymentBefore(before: Date, limit: number): Promise<string[]>;
}

export interface IdempotencyKeys {
  find(key: string, requestHash: string): Promise<string | undefined>;
  claim(key: string, requestHash: string, orderId: string, now: Date): Promise<boolean>;
}

export interface ProcessedEvents {
  markProcessed(eventId: string, eventType: string, now: Date): Promise<boolean>;
}

export type OutboxMessage = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: string;
  occurredAt: Date;
};

export interface EventOutbox {
  append(events: OrderEvent[]): Promise<void>;
  unpublished(limit: number): Promise<OutboxMessage[]>;
  markPublished(id: string, at: Date): Promise<void>;
}

export interface ExternalEventPublisher {
  publish(message: OutboxMessage): Promise<void>;
}

export type Prices = Map<string, Money>;

export interface CatalogGateway {
  prices(productIds: string[]): Promise<Prices>;
}

export type RefundRequest = {
  orderId: string;
  paymentId: string;
  amount: Money;
  idempotencyKey: string;
};

export interface PaymentGateway {
  requestRefund(refund: RefundRequest): Promise<string>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

export type TransactionalPorts = {
  orders: OrderRepository;
  keys: IdempotencyKeys;
  outbox: EventOutbox;
  processed: ProcessedEvents;
};

export interface UnitOfWork {
  within<T>(work: (tx: TransactionalPorts) => Promise<T>): Promise<T>;
}
