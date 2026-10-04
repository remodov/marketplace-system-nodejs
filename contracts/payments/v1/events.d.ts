export declare const TOPIC: 'marketplace.payments.v1';

export declare const EVENT_PAYMENT_COMPLETED: 'PaymentCompleted';
export declare const EVENT_PAYMENT_FAILED: 'PaymentFailed';

export type EventType = typeof EVENT_PAYMENT_COMPLETED | typeof EVENT_PAYMENT_FAILED;

export type PaymentCompletedPayload = {
  paymentId: string;
  orderId: string;
  amount: string;
  currency: string;
  occurredAt: string;
};
