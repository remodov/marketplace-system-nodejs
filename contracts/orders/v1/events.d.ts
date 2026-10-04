export declare const TOPIC: 'marketplace.orders.v1';

export declare const HEADER_EVENT_ID: 'event-id';
export declare const HEADER_EVENT_TYPE: 'event-type';
export declare const HEADER_EVENT_VERSION: 'event-version';
export declare const HEADER_AGGREGATE_TYPE: 'aggregate-type';
export declare const HEADER_AGGREGATE_ID: 'aggregate-id';
export declare const HEADER_OCCURRED_AT: 'occurred-at';

export declare const EVENT_ORDER_CREATED: 'OrderCreated';
export declare const EVENT_ORDER_CONFIRMED: 'OrderConfirmed';
export declare const EVENT_ORDER_PAID: 'OrderPaid';
export declare const EVENT_ORDER_SHIPPED: 'OrderShipped';
export declare const EVENT_ORDER_DELIVERED: 'OrderDelivered';
export declare const EVENT_ORDER_COMPLETED: 'OrderCompleted';
export declare const EVENT_ORDER_EXPIRED: 'OrderExpired';
export declare const EVENT_ORDER_CANCELLED: 'OrderCancelled';
export declare const EVENT_DISPUTE_OPENED: 'DisputeOpened';
export declare const EVENT_DISPUTE_RESOLVED: 'DisputeResolved';

export type EventType =
  | typeof EVENT_ORDER_CREATED
  | typeof EVENT_ORDER_CONFIRMED
  | typeof EVENT_ORDER_PAID
  | typeof EVENT_ORDER_SHIPPED
  | typeof EVENT_ORDER_DELIVERED
  | typeof EVENT_ORDER_COMPLETED
  | typeof EVENT_ORDER_EXPIRED
  | typeof EVENT_ORDER_CANCELLED
  | typeof EVENT_DISPUTE_OPENED
  | typeof EVENT_DISPUTE_RESOLVED;

export type OrderEventBase = {
  orderId: string;
  customerId: string;
  sellerId: string;
  occurredAt: string;
};

export type OrderCreatedPayload = OrderEventBase & {
  totalAmount: string;
  currency: string;
  itemsCount: number;
};

export type OrderConfirmedPayload = OrderEventBase & {
  totalAmount: string;
  currency: string;
};

export type OrderPaidPayload = OrderEventBase & {
  totalAmount: string;
  currency: string;
  paymentId: string;
};

export type OrderShippedPayload = OrderEventBase & {
  trackingNumber: string;
};

export type OrderDeliveredPayload = OrderEventBase;

export type OrderCompletedPayload = OrderEventBase;

export type OrderExpiredPayload = OrderEventBase;

export type OrderCancelledPayload = OrderEventBase & {
  previousStatus: string;
  reason?: string;
  refundId?: string;
};

export type DisputeOpenedPayload = OrderEventBase & {
  reason: string;
};

export type DisputeResolvedPayload = OrderEventBase & {
  finalStatus: string;
  resolutionNote: string;
};
