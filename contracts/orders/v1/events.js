'use strict';

exports.TOPIC = 'marketplace.orders.v1';

exports.HEADER_EVENT_ID = 'event-id';
exports.HEADER_EVENT_TYPE = 'event-type';
exports.HEADER_EVENT_VERSION = 'event-version';
exports.HEADER_AGGREGATE_TYPE = 'aggregate-type';
exports.HEADER_AGGREGATE_ID = 'aggregate-id';
exports.HEADER_OCCURRED_AT = 'occurred-at';

exports.EVENT_ORDER_CREATED = 'OrderCreated';
exports.EVENT_ORDER_CONFIRMED = 'OrderConfirmed';
exports.EVENT_ORDER_PAID = 'OrderPaid';
exports.EVENT_ORDER_SHIPPED = 'OrderShipped';
exports.EVENT_ORDER_DELIVERED = 'OrderDelivered';
exports.EVENT_ORDER_COMPLETED = 'OrderCompleted';
exports.EVENT_ORDER_EXPIRED = 'OrderExpired';
exports.EVENT_ORDER_CANCELLED = 'OrderCancelled';
exports.EVENT_DISPUTE_OPENED = 'DisputeOpened';
exports.EVENT_DISPUTE_RESOLVED = 'DisputeResolved';
