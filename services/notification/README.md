# notification

Notification Service из сквозного маркетплейс-кейса сайта [vikulin-va.ru](https://vikulin-va.ru/use-case-pattern/case/notification-service/):
читает события заказа из Kafka и заводит уведомления адресату. В практикуме на Node появляется на десятом шаге как
потребитель outbox сервиса заказов; доставка писем и push тут не реализована, уведомление остаётся в статусе `PENDING`.

## Как устроен сервис

```
src/main.ts                   точка входа: миграции, HTTP, консьюмер в фоне, остановка
src/
  config.ts                   переменные окружения
  app.module.ts               сборка зависимостей, фильтр ошибок, остановка консьюмера
  migrations/                 TypeORM: processed_events и notifications
  persistence/                настройки DataSource
  inbox/                      идемпотентная обработка: processed_events и уведомление в одной транзакции
  consumer/                   kafkajs: заголовки event-id и event-type, commit offset после обработки
  httpapi/                    GET /api/v1/notifications?userId= для администратора, health, Problem Details
```

Контракт событий общий с продюсером: пакет [`@marketplace/contracts-orders-v1`](../../contracts/orders/v1/) из
`contracts/`. Адресат берётся из `customerId`, у `DisputeOpened` - из `sellerId`. Payload не по контракту (например,
`customerId` вложенным объектом) это ошибка обработки `ContractViolationError`: offset не сдвигается,
в `processed_events` записи нет.

## Повторная доставка

Kafka доставляет как минимум один раз: перебалансировка группы, повтор relay после сбоя пометки. Поэтому перед
работой консьюмер вставляет `event-id` в `processed_events` с `ON CONFLICT DO NOTHING` в той же транзакции, что и
уведомление. Второй раз вставка даёт ноль строк, второе письмо не рождается.

Консьюмер идёт с `autoCommit: false` и после обработки сам вызывает `commitOffsets` со значением `offset + 1`:
Kafka хранит не последнее прочитанное, а следующее к чтению. Заголовки в kafkajs приходят `Buffer`, перед
сравнением их надо превратить в строку.

## Запуск

```bash
docker compose -f ../../infra/compose.yaml up -d
npm install
npm run build && npm start
curl -s 'localhost:3085/api/v1/notifications?userId=<uuid покупателя>' -H 'Authorization: Bearer admin'
```

Переменные: `HTTP_PORT` (`3085`), `DATABASE_URL` (`postgres://catalog:catalog@localhost:5450/notifications`),
`KAFKA_BROKERS` (`localhost:9095`), `KAFKA_GROUP` (`notification`), `KAFKA_TOPIC` (`marketplace.orders.v1`),
`ADMIN_TOKEN` (`admin`). Если Kafka не поднята, HTTP всё равно отвечает, а консьюмер повторяет подключение раз в
пять секунд.

## Тесты

```bash
npm test
```

Тесты `test/inbox.spec.ts` идут на настоящей PostgreSQL (`notifications_test` из compose, `TEST_DATABASE_URL`):
повторная доставка даёт одно уведомление, спор адресуется продавцу, payload не по контракту отклоняется без пометки,
событие без адресата сообщается и не сохраняется, `OrderCreated` по контракту из `contracts/orders/v1`
обрабатывается. `test/http.spec.ts` проверяет пробы, токен администратора и список уведомлений. Kafka тестам не нужна.

## Что почитать

- [Kafka на Node в production](https://vikulin-va.ru/kafka/node/production-essentials/): консьюмер, заголовки, commit offset.
- [Распределённые паттерны на Node](https://vikulin-va.ru/patterns/node/distributed-patterns/): идемпотентный потребитель.
