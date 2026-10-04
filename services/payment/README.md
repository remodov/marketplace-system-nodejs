# payment

Payment Service из сквозного маркетплейс-кейса сайта [vikulin-va.ru](https://vikulin-va.ru/use-case-pattern/case/):
авторизация, списание и возврат платежа по заказу. В практикуме на Node появляется на одиннадцатом шаге как сервис,
в который ходит сага отмены заказа; это задание ученика.

Нарочно самый простой сервис из всех: один модуль NestJS, `pg` напрямую с SQL и маппингом руками, схема из
`schema.sql` при старте вместо миграций, ни портов, ни TypeORM. Сравни с соседями: `catalog-starter` и `catalog` на
репозиториях TypeORM, `order` на TypeORM с портами, единицей работы и миграциями. Что каждый из них скрывает и что даёт?

```
src/main.ts                   точка входа: схема при старте, HTTP, остановка
src/
  config.ts                   HTTP_PORT и DATABASE_URL
  app.module.ts               сборка зависимостей: Pool, часы, сервис; фильтр ошибок и валидация
  payment/
    payment.ts                статусы, автомат canMoveTo, модель Payment и переход moveTo
    payment.service.ts        авторизация, списание, возврат; транзакция через pool.connect
    payment.repository.ts     SQL руками: schema.sql, выборки, вставка, обновление статуса
    payment.controller.ts     ручки, DTO в payment.dto.ts
  httpapi/                    Problem Details, health
```

## Автомат статусов

У платежа четыре статуса: `AUTHORIZED`, `CAPTURED`, `REFUNDED`, `FAILED`. `canMoveTo` в `src/payment/payment.ts`
перечисляет **разрешённое**: `AUTHORIZED -> CAPTURED | REFUNDED | FAILED`, `CAPTURED -> REFUNDED`; конечные статусы
никуда не ведут, переход в себя же не переход. Всё остальное `moveTo` отвергает ошибкой `InvalidTransitionError`,
наружу это `409 INVALID_PAYMENT_TRANSITION`.

Повторы саги обрабатываются в сервисе, а не в автомате: повторная авторизация того же заказа возвращает уже
созданный платёж (`order_id` уникален), повторный возврат отдаёт тот же ответ, а деньги возвращаются один раз.

## Ручки

```
POST /api/v1/payments               {"orderId","amount","currency"} -> 201, AUTHORIZED
GET  /api/v1/payments/{id}
POST /api/v1/payments/{id}/capture  -> CAPTURED
POST /api/v1/payments/{id}/refund   -> REFUNDED, повтор безопасен
```

Ошибки: `VALIDATION_ERROR`, `MALFORMED_REQUEST` (400), `PAYMENT_NOT_FOUND` (404), `INVALID_PAYMENT_TRANSITION` (409),
`NOT_READY` (503). Тело в формате Problem Details, `type` вида `urn:problem:payment:<CODE>`.

## Запуск и тесты

```bash
docker compose -f ../../infra/compose.yaml up -d postgres-catalog-starter
npm install
npm run build && npm start
npm test
```

Переменные: `HTTP_PORT` (`3086`), `DATABASE_URL` (`postgres://catalog:catalog@localhost:5450/payments`).
Тесты автомата (`test/transitions.spec.ts`) идут без базы, тесты API (`test/api.spec.ts`) - на настоящей PostgreSQL
(`payments_test` из compose, `TEST_DATABASE_URL`). Событий в Kafka сервис не публикует: топик
`marketplace.payments.v1` из [`contracts/payments/v1`](../../contracts/payments/v1/) читает `order`, а отметка оплаты
на стенде ставится ручкой `POST /api/v1/orders/{id}/pay` администратором.

## Сквозной прогон

Проверено руками на стенде из compose: `catalog` (3080), `order` (3081), `notification` (3085) и `payment` (3086)
из собранных `dist`, Kafka поднята, `order` при старте сам создаёт топик `marketplace.payments.v1` и читает его.

```bash
SELLER=$(uuidgen | tr A-Z a-z); CUSTOMER=$(uuidgen | tr A-Z a-z); ADMIN=$(uuidgen | tr A-Z a-z)
PRODUCT=$(curl -s -X POST localhost:3080/api/v1/products -H "Authorization: Bearer seller.$SELLER" \
  -H 'Content-Type: application/json' -d '{"title":"Кофемолка","price":2490.5,"currency":"RUB"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
curl -s -o /dev/null -X POST localhost:3080/api/v1/products/$PRODUCT/publish -H "Authorization: Bearer seller.$SELLER"
ORDER=$(curl -s -X POST localhost:3081/api/v1/orders -H "Authorization: Bearer customer.$CUSTOMER" -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"productId\":\"$PRODUCT\",\"sellerId\":\"$SELLER\",\"quantity\":2}],\"shippingAddress\":{\"country\":\"RU\",\"city\":\"Москва\",\"street\":\"Тверская, 1\",\"postalCode\":\"125009\"}}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
curl -s -X POST localhost:3081/api/v1/orders/$ORDER/confirm -H "Authorization: Bearer customer.$CUSTOMER"
PAYMENT=$(curl -s -X POST localhost:3086/api/v1/payments -H 'Content-Type: application/json' \
  -d "{\"orderId\":\"$ORDER\",\"amount\":4981,\"currency\":\"RUB\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
curl -s -X POST localhost:3086/api/v1/payments/$PAYMENT/capture
curl -s -X POST localhost:3081/api/v1/orders/$ORDER/pay -H "Authorization: Bearer admin.$ADMIN" \
  -H 'Content-Type: application/json' -d "{\"paymentId\":\"$PAYMENT\"}"
curl -s -X POST localhost:3081/api/v1/orders/$ORDER/cancel -H "Authorization: Bearer customer.$CUSTOMER" \
  -H 'Content-Type: application/json' -d '{"reasonCode":"changed_mind","comment":"передумал"}'
curl -s localhost:3086/api/v1/payments/$PAYMENT
```

Результат: заказ `DRAFT` на 4981.00 -> `PENDING_PAYMENT` -> `PAID` с `paymentId` и `paidAt`; платёж `AUTHORIZED` ->
`CAPTURED`; отмена отвечает `CANCELLED` с `closedAt`, платёж после неё `REFUNDED`, повторная отмена того же заказа -
`409 ORDER_INVALID_STATE`. В `outbox` заказа лежат `OrderCreated`, `OrderConfirmed`, `OrderPaid`, `OrderCancelled`,
relay их отправил, `notification` завёл покупателю уведомления `order-paid` и `order-status-changed`.

Второй заказ доведён до `PAID` тем же путём, после чего процесс `payment` убит (`kill`, `/health/live` не отвечает).
Отмена второго заказа отвечает `503 SERVICE_DEGRADED` с `detail: Сервис платежей временно недоступен`, в логе
`order` строка `сосед недоступен на POST /api/v1/orders/<id>/cancel`, заказ по `GET` остаётся `PAID`, события
`OrderCancelled` в `outbox` нет, платёж в базе `payments` так и стоит `CAPTURED`. Подняв `payment` обратно, отмену
можно повторить: возврат пройдёт, заказ закроется.

## Что почитать

- [Распределённые паттерны на Node](https://vikulin-va.ru/patterns/node/distributed-patterns/): сага и компенсации.
- [Что такое конечный автомат](https://vikulin-va.ru/state-machines/what-is-a-state-machine/): переходы перечислены разрешёнными.
- [Паттерны отказоустойчивости на Node](https://vikulin-va.ru/patterns/node/resilience/): как сосед переживает отказ платежей.
