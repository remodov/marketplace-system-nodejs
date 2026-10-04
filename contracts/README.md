# contracts

Внешний контракт событий заказа: один на продюсера (`services/order`) и потребителей
(`services/notification`, позже `services/payment`).

- [`asyncapi/marketplace-orders-v1.yaml`](asyncapi/marketplace-orders-v1.yaml) - канал, заголовки, сообщения.
- [`schemas/order-events.yaml`](schemas/order-events.yaml) - поля событий, один источник правды.
- [`orders/v1`](orders/v1/) - пакет `@marketplace/contracts-orders-v1` с теми же полями: типы payload в
  `events.d.ts`, имена топика, заголовков и типов событий в `events.js`. Сборки у пакета нет, сервисы подключают
  его зависимостью `"@marketplace/contracts-orders-v1": "file:../../contracts/orders/v1"`: продюсер собирает
  payload по его типам, потребитель читает в них, компилируются оба против одних типов.

Контракт намеренно плоский: во внешнее событие не протекают внутренние типы сервиса. `customerId` - строка
с UUID, а не вложенный объект; сумма - десятичная строка, а не число с плавающей точкой.
