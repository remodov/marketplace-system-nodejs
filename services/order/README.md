# order

Order Service из сквозного маркетплейс-кейса сайта [vikulin-va.ru](https://vikulin-va.ru/use-case-pattern/case/order-service/):
оформление заказов. Сервис ходит за ценами в соседний `catalog` и с восьмого шага практикума умеет
переживать его медленные ответы, сорванные соединения и полное отсутствие.

**Уровень 3** методологии Use Case Pattern: агрегат `Order` с позициями и правилами внутри, команда и
обработчик сценария с явными портами, выходной адаптер к каталогу с таймаутами, повтором и размыкателем.
С девятого шага создание заказа идемпотентно по заголовку `Idempotency-Key`. Статусная модель, outbox и сага
появляются на следующих шагах.

Спецификация в [`docs/spec/`](docs/spec/), контракт REST в [`docs/order.openapi.yaml`](docs/order.openapi.yaml).

## Как устроен сервис

```
src/main.ts                             точка входа: конфигурация, миграции, сервер, остановка
src/
  core/
    apperr.ts                           ошибки с видом и кодом, общие для ядра и адаптеров
    security/                           Principal из токена, роли
    order/
      aggregate/                        Order и Item: поля закрыты, правила в методах, Money и Address
      port/out/                         интерфейсы: репозиторий, ключи идемпотентности, шлюз каталога, часы, идентификаторы, единица работы
      usecase/                          команда CreateOrder и её обработчик: ключ идемпотентности, цены, транзакция
      query/                            чтение заказа с проверкой владения
  adapter/
    in/http/                            контроллеры NestJS, Problem Details, роли в guard, DTO, заголовок Idempotency-Key и хеш тела
    out/catalog/                        HTTP-клиент каталога: undici, таймауты, повтор, размыкатель opossum
    out/persistence/                    TypeORM: строки-сущности, миграции, транзакция, ключи идемпотентности
    out/system/                         системные часы и uuid
  bootstrap/                            конфигурация, настройки клиента каталога, сборка зависимостей, AppModule
```

Ядро не знает ни про NestJS, ни про TypeORM, ни про opossum: это стережёт `test/architecture.spec.ts`.
Каталог для ядра - интерфейс `CatalogGateway`, который отдаёт цены или ошибку с кодом; как именно клиент
добывает цены и когда сдаётся, ядро не видит.

## Запуск

```bash
docker compose -f ../../infra/compose.yaml up -d postgres-catalog-starter
(cd ../catalog && npm install && npm run build && npm start &)
npm install
npm run build && npm start
```

Переменные: `HTTP_PORT` (`3081`), `DATABASE_URL` (`postgres://catalog:catalog@localhost:5450/orders`),
`CATALOG_URL` (`http://localhost:3080`), `AUTH_MODE` (`local` или `jwt`), для `jwt` ещё `JWKS_URL`,
`JWT_ISSUER`, `JWT_AUDIENCE`.

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

## Тесты

```bash
npm test
```

Интеграционные тесты идут на настоящей PostgreSQL (`orders_test` из compose, `TEST_DATABASE_URL`).
Каталог в тестах подменяется локальным `http.createServer`, который умеет держать ответ, рвать соединение
и отвечать 404: четыре проверки в `test/catalog-resilience.spec.ts` закрывают повтор, лежащий каталог,
таймаут и размыкатель. Пять проверок в `test/idempotency.spec.ts` закрывают повтор с тем же ключом, конфликт
хеша, разные ключи, восемь одновременных запросов и отсутствие заголовка. Числа клиента в тестах уменьшены
через `testSettings` в `test/support.ts`. `npm test` сначала прогоняет `tsc --noEmit`.

## Коды ошибок

`VALIDATION_ERROR`, `MALFORMED_REQUEST`, `EMPTY_ORDER`, `MULTI_SELLER_NOT_SUPPORTED`, `INVALID_PRICE` (400),
`TOKEN_MISSING`, `TOKEN_INVALID` (401), `ACCESS_DENIED` (403), `PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND` (404),
`IDEMPOTENCY_KEY_CONFLICT` (409), `SERVICE_DEGRADED` (503). Тело ошибки в формате Problem Details, `type` вида `urn:problem:order:<CODE>`.

## Что почитать

- [Order Service в кейсе](https://vikulin-va.ru/use-case-pattern/case/order-service/) и [Use Case Pattern](https://vikulin-va.ru/use-case-pattern/).
- [Паттерны отказоустойчивости на Node](https://vikulin-va.ru/patterns/node/resilience/): повтор, таймаут, размыкатель.
- [Монолит и микросервисы](https://vikulin-va.ru/architecture-choice/monolith-vs-microservices/): цена сетевого вызова к соседу.
- [Гексагональная архитектура на Node](https://vikulin-va.ru/patterns/hexagonal/node/core-layer/): почему каталог для ядра - интерфейс.
- [HTTP-заголовки и Idempotency-Key на Node](https://vikulin-va.ru/rest-api/node/headers/): ключ занимается до операции.
- [Идемпотентность запросов при остановке](https://vikulin-va.ru/graceful-shutdown/node/idempotency-in-flight/): что будет с ключом, если сервис погасили на полпути.
