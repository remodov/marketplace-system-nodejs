# order

Order Service из сквозного маркетплейс-кейса сайта [vikulin-va.ru](https://vikulin-va.ru/use-case-pattern/case/order-service/):
оформление заказов. Сервис ходит за ценами в соседний `catalog` и с восьмого шага практикума умеет
переживать его медленные ответы, сорванные соединения и полное отсутствие.

**Уровень 3** методологии Use Case Pattern: агрегат `Order` с позициями и правилами внутри, команда и
обработчик сценария с явными портами, выходной адаптер к каталогу с таймаутами, повтором и размыкателем.
С девятого шага создание заказа идемпотентно по заголовку `Idempotency-Key`, с десятого события уезжают соседям
через outbox и Kafka по внешнему контракту из [`contracts/`](../../contracts/), с одиннадцатого заказ живёт по
статусной модели, а отмена оплаченного заказа идёт сагой с возвратом денег через `payment`.

Спецификация в [`docs/spec/`](docs/spec/), контракт REST в [`docs/order.openapi.yaml`](docs/order.openapi.yaml).

## Как устроен сервис

```
src/main.ts                             точка входа: конфигурация, миграции, сервер, relay, просрочка оплаты, потребитель платежей, остановка
src/
  core/
    apperr.ts                           ошибки с видом и кодом, общие для ядра и адаптеров
    security/                           Principal из токена, роли
    order/
      aggregate/                        Order и Item: поля закрыты, переходы статусов в методах, Money и Address, события заказа
      port/out/                         интерфейсы: репозиторий, ключи идемпотентности, outbox, обработанные события, издатель, шлюзы каталога и платежей, часы, идентификаторы, единица работы
      usecase/                          CreateOrder, переходы статусов (LifecycleHandler), relay outbox и просрочка оплаты как фоновые сценарии
      query/                            чтение заказа с проверкой владения
  adapter/
    in/http/                            контроллеры NestJS, Problem Details, роли в guard, DTO, заголовок Idempotency-Key и хеш тела
    in/kafka/                           потребитель PaymentCompleted на kafkajs: processed_events и перевод в PAID одной транзакцией
    out/catalog/                        HTTP-клиент каталога: undici, таймауты, повтор, размыкатель opossum
    out/payment/                        HTTP-клиент возврата в сервис платежей: undici, таймауты, Idempotency-Key
    out/persistence/                    TypeORM: строки-сущности, миграции, транзакция, ключи идемпотентности, outbox, обработанные события
    out/kafka/                          издатель событий на kafkajs: ключ, заголовки, acks=all
    out/system/                         системные часы и uuid, издатель в лог, журналы relay и просрочки
  bootstrap/                            конфигурация, настройки клиента каталога, сборка зависимостей, AppModule
```

Ядро не знает ни про NestJS, ни про TypeORM, ни про opossum, ни про kafkajs: это стережёт `test/architecture.spec.ts`.
Каталог для ядра - интерфейс `CatalogGateway`, который отдаёт цены или ошибку с кодом; как именно клиент
добывает цены и когда сдаётся, ядро не видит.

## Запуск

```bash
docker compose -f ../../infra/compose.yaml up -d postgres-catalog-starter kafka
(cd ../catalog && npm install && npm run build && npm start &)
npm install
npm run build && npm start
```

Переменные: `HTTP_PORT` (`3081`), `DATABASE_URL` (`postgres://catalog:catalog@localhost:5450/orders`),
`CATALOG_URL` (`http://localhost:3080`), `PAYMENT_URL` (`http://localhost:3086`), `KAFKA_BROKERS` (`localhost:9095`),
`KAFKA_GROUP` (`order`), `KAFKA_TOPIC` (`marketplace.orders.v1`), `PAYMENTS_TOPIC` (`marketplace.payments.v1`),
`EVENT_PUBLISHER` (`kafka`; `log` - без брокера: события только в лог, события платежей не читаются),
`OUTBOX_RELAY_INTERVAL_MS` (`1000`), `EXPIRE_UNPAID_AFTER_MS` (`900000`, 15 минут), `EXPIRE_INTERVAL_MS` (`60000`),
`AUTH_MODE` (`local` или `jwt`), для `jwt` ещё `JWKS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE`.

В режиме `local` токен это строка `role.uuid`, роли `customer`, `seller`, `admin`:

```bash
CUSTOMER=$(uuidgen | tr A-Z a-z)
curl -s -X POST localhost:3081/api/v1/orders -H "Authorization: Bearer customer.$CUSTOMER" \
  -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":"<id опубликованного товара>","sellerId":"<id продавца>","quantity":2}],
       "shippingAddress":{"country":"RU","city":"Москва","street":"Тверская, 1","postalCode":"125009"}}'
```

Товар должен быть опубликован в каталоге: черновики каталог отдаёт только владельцу, а заказ ходит без токена.

## Что происходит, когда каталог не отвечает

Клиент каталога (`src/adapter/out/catalog/catalog.client.ts`) и его настройки (`catalogSettings` в
`src/bootstrap/wiring.ts`):

| что | значение | зачем |
|---|---|---|
| таймаут соединения | 500 мс | не висеть на `connect`, если сосед не слушает |
| таймаут запроса | 1 с | медленный сосед не должен держать обработчик заказа |
| попытки | 2, пауза 50 мс | одна сорванная попытка не роняет оформление |
| размыкатель | половина отказов из последних десяти вызовов за 30 с, открыт 60 с | лежащему соседу не копить очередь запросов |

Повторяются только сетевые ошибки и ответы 5xx. Ответ `404` каталога это не отказ, а ответ: он без повтора
становится `PRODUCT_NOT_FOUND`. Исчерпанные попытки и открытый размыкатель уходят наружу как
`503 SERVICE_DEGRADED`, заказ при этом не создаётся. Худшее время ответа при этих числах: две попытки по
секунде и пауза, около 2,05 с.

## Один запрос - один заказ

Заголовок `Idempotency-Key` обязателен. Сценарий сначала ищет ключ: тот же ключ с тем же хешем тела отдаёт
прежний заказ ответом 200, тот же ключ с другим телом - `409 IDEMPOTENCY_KEY_CONFLICT`. Если ключа нет, заказ и
ключ пишутся в одной транзакции (`UnitOfWork.within`), ключ занимается вставкой с `ON CONFLICT DO NOTHING`: при
гонке второй `INSERT` дожидается первой транзакции, получает ноль строк, проигравший бросает ошибку из
транзакции, чем откатывает свой заказ, и читает чужой. Тест «восемь одинаковых запросов разом создают один
заказ» шлёт их через `Promise.all` и ждёт один заказ и один ответ 201. Хеш тела считается в HTTP-адаптере
(`src/adapter/in/http/idempotency.ts`) как SHA-256 от канонического JSON разобранного запроса с отсортированными
ключами, в ядро доезжает уже строкой.

## Событие уезжает через outbox

Агрегат при создании регистрирует `OrderCreated` (`src/core/order/aggregate/events.ts`); обработчик сценария
забирает события `order.pullEvents()` и кладёт их в таблицу `outbox` через `tx.outbox.append` в той же транзакции,
что заказ и ключ идемпотентности. Фоновый цикл relay (`OutboxRelay.run` в `src/core/order/usecase/relay-outbox.ts`,
запускается из `main.ts` после старта HTTP) раз в `OUTBOX_RELAY_INTERVAL_MS` берёт пачку строк с
`published_at IS NULL` под `FOR UPDATE SKIP LOCKED`, публикует каждую через порт `ExternalEventPublisher` и помечает
отправленной в той же транзакции; упал брокер - транзакция откатилась, строки остались, следующий круг повторит.
Остановка приложения (`OnApplicationShutdown`) ждёт конца текущей пачки, а не рвёт её.

Payload строки это внешний контракт, а не дамп внутреннего типа: `payloadOf` в
`src/adapter/out/persistence/outbox.repository.ts` собирает `OrderCreatedPayload` из пакета
[`@marketplace/contracts-orders-v1`](../../contracts/orders/v1/) - `customerId` строкой, сумма десятичной строкой,
ничего лишнего. `JSON.stringify(event)` внутреннего события дал бы поле `type`, `total` объектом и массив `items`,
и потребитель такой payload отклоняет. Издатель `src/adapter/out/kafka/kafka.publisher.ts` пишет в топик
`marketplace.orders.v1` с ключом `aggregateId` и заголовками `event-id`, `event-type`, `event-version`,
`aggregate-type`, `aggregate-id`, `occurred-at`; по `event-id` потребитель отбрасывает повторную доставку.

## Статусы и сага отмены

Переходы живут в агрегате (`src/core/order/aggregate/order.ts`) и перечисляют разрешённое: `confirm` DRAFT ->
PENDING_PAYMENT (не меньше 100 рублей, иначе `ORDER_BELOW_MINIMUM`), `markPaid` -> PAID, `markShipped` -> SHIPPED,
`confirmDelivery` -> DELIVERED, `cancel` из DRAFT и PENDING_PAYMENT, `cancelAfterPayment` из PAID, `expire` из
PENDING_PAYMENT. Всё остальное отвечает `409 ORDER_INVALID_STATE` и данные не трогает. Каждый переход
(`LifecycleHandler` в `src/core/order/usecase/lifecycle.ts`) - одна транзакция: строка под `FOR UPDATE`
(`byIdForUpdate`), метод агрегата, `UPDATE`, события в outbox.

Ручки: `POST /api/v1/orders/{id}/confirm`, `/cancel` (покупатель или администратор), `/ship` (продавец заказа),
`/deliver` (покупатель), `/pay` (только администратор, для стенда; в бою оплату приносит событие `PaymentCompleted`
из топика `marketplace.payments.v1`, потребитель `src/adapter/in/kafka/payment-events.consumer.ts` отбрасывает повтор
по `event-id` через `processed_events` в той же транзакции, что и перевод в PAID).

Отмена оплаченного заказа - сага с компенсацией: обработчик внутри транзакции зовёт сервис платежей
`POST /api/v1/payments/{paymentId}/refund` с `Idempotency-Key: refund-<orderId>` (`src/adapter/out/payment/payment.client.ts`,
таймауты 500 мс на соединение и 2 с на запрос) и только после успешного возврата переводит заказ в CANCELLED с `refundId`
в событии `OrderCancelled`. Платежи легли - `503 SERVICE_DEGRADED`, транзакция откатилась, заказ остался PAID, повтор
отмены безопасен: платежи повторный возврат не считают вторым. Неоплаченный заказ закрывает фоновый `ExpireUnpaid`:
раз в `EXPIRE_INTERVAL_MS` переводит в EXPIRED те, что висят в PENDING_PAYMENT дольше `EXPIRE_UNPAID_AFTER_MS`.

## Сквозной прогон

Проверено руками на стенде из compose: `catalog` (3080), `order` (3081) и `notification` (3085) из собранных `dist`,
причём `notification` поднят первым, когда топика в Kafka ещё не было. Прогон саги отмены с `payment` (3086) описан
в [`services/payment/README.md`](../payment/README.md).

```bash
SELLER=$(uuidgen | tr A-Z a-z); CUSTOMER=$(uuidgen | tr A-Z a-z)
PRODUCT=$(curl -s -X POST localhost:3080/api/v1/products -H "Authorization: Bearer seller.$SELLER" \
  -H 'Content-Type: application/json' -d '{"title":"Кофемолка","price":2490.5,"currency":"RUB"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
curl -s -o /dev/null -X POST localhost:3080/api/v1/products/$PRODUCT/publish -H "Authorization: Bearer seller.$SELLER"
curl -s -X POST localhost:3081/api/v1/orders -H "Authorization: Bearer customer.$CUSTOMER" -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"productId\":\"$PRODUCT\",\"sellerId\":\"$SELLER\",\"quantity\":2}],\"shippingAddress\":{\"country\":\"RU\",\"city\":\"Москва\",\"street\":\"Тверская, 1\",\"postalCode\":\"125009\"}}"
sleep 3
curl -s "localhost:3085/api/v1/notifications?userId=$CUSTOMER" -H 'Authorization: Bearer admin'
```

Результат: заказ `DRAFT` на 4981.00, повтор с тем же `Idempotency-Key` отвечает 200 и второй строки в `outbox` не
даёт; в логе `order` через секунду `relay: события отправлены, 1`, строка в `outbox` помечена; `notification` при
старте пишет `топик marketplace.orders.v1 создан, продюсер его ещё не писал`, затем `читаем marketplace.orders.v1`,
и уже через две секунды после заказа отдаёт одно уведомление покупателю: `eventType: OrderCreated`,
`templateKey: order-created`, `status: PENDING`. Без `Authorization: Bearer admin` тот же запрос даёт 403.

## Тесты

```bash
npm test
```

Интеграционные тесты идут на настоящей PostgreSQL (`orders_test` из compose, `TEST_DATABASE_URL`).
Каталог в тестах подменяется локальным `http.createServer`, который умеет держать ответ, рвать соединение
и отвечать 404: четыре проверки в `test/catalog-resilience.spec.ts` закрывают повтор, лежащий каталог,
таймаут и размыкатель. Пять проверок в `test/idempotency.spec.ts` закрывают повтор с тем же ключом, конфликт
хеша, разные ключи, восемь одновременных запросов и отсутствие заголовка. Пять проверок в `test/outbox.spec.ts`
закрывают строку outbox вместе с заказом, поля payload по контракту, повтор без второго события, relay с пометкой
и лежащий брокер. Десять проверок в `test/lifecycle.spec.ts` проходят заказ от черновика до получения, отмену
с возвратом через подменный сервис платежей (`startPayment` в `test/support.ts` умеет записывать запросы и рвать
соединение), лежащие платежи с заказом, оставшимся PAID, просрочку оплаты на подкручиваемых часах `TestClock` и
двойную доставку `PaymentCompleted`. `test/kafka-publisher.spec.ts` ждёт Kafka со стенда (`KAFKA_BROKERS`), публикует сообщение
в отдельный топик и читает его консьюмером kafkajs; если брокер не поднят, проверка пропускается с предупреждением.
Предупреждение `TimeoutNegativeWarning` в выводе идёт из внутренней очереди запросов kafkajs и на результат не влияет.
Числа клиента в тестах уменьшены через `testSettings` в `test/support.ts`. `npm test` сначала прогоняет `tsc --noEmit`.

## Коды ошибок

`VALIDATION_ERROR`, `MALFORMED_REQUEST`, `EMPTY_ORDER`, `MULTI_SELLER_NOT_SUPPORTED`, `INVALID_PRICE`,
`ORDER_BELOW_MINIMUM` (400), `TOKEN_MISSING`, `TOKEN_INVALID` (401), `ACCESS_DENIED` (403), `PRODUCT_NOT_FOUND`,
`ORDER_NOT_FOUND` (404), `IDEMPOTENCY_KEY_CONFLICT`, `ORDER_INVALID_STATE`, `REFUND_REJECTED`, `PAYMENT_NOT_FOUND` (409),
`SERVICE_DEGRADED` (503). Тело ошибки в формате Problem Details, `type` вида `urn:problem:order:<CODE>`.

## Что почитать

- [Order Service в кейсе](https://vikulin-va.ru/use-case-pattern/case/order-service/) и [Use Case Pattern](https://vikulin-va.ru/use-case-pattern/).
- [Паттерны отказоустойчивости на Node](https://vikulin-va.ru/patterns/node/resilience/): повтор, таймаут, размыкатель.
- [Монолит и микросервисы](https://vikulin-va.ru/architecture-choice/monolith-vs-microservices/): цена сетевого вызова к соседу.
- [Гексагональная архитектура на Node](https://vikulin-va.ru/patterns/hexagonal/node/core-layer/): почему каталог для ядра - интерфейс.
- [HTTP-заголовки и Idempotency-Key на Node](https://vikulin-va.ru/rest-api/node/headers/): ключ занимается до операции.
- [Идемпотентность запросов при остановке](https://vikulin-va.ru/graceful-shutdown/node/idempotency-in-flight/): что будет с ключом, если сервис погасили на полпути.
- [Распределённые паттерны на Node](https://vikulin-va.ru/patterns/node/distributed-patterns/): outbox, идемпотентный потребитель, сага и компенсации.
- [Что такое конечный автомат](https://vikulin-va.ru/state-machines/what-is-a-state-machine/): почему переходы перечислены разрешёнными.
- [Фоновые задачи и outbox-relay при остановке](https://vikulin-va.ru/graceful-shutdown/node/scheduled-async-outbox/).
- [Kafka на Node в production](https://vikulin-va.ru/kafka/node/production-essentials/): заголовки, acks, commit offset.
