# catalog

Catalog Service из сквозного маркетплейс-кейса сайта [vikulin-va.ru](https://vikulin-va.ru/use-case-pattern/case/catalog-service/),
взрослая версия учебного `catalog-starter`: те же карточки товаров, но с границами слоёв, спецификацией,
ролями, владением и журналом действий администратора.

**Уровень 2** методологии Use Case Pattern: команда и обработчик сценария с явными портами, без агрегатов
с событиями и саг. Простой автомат статусов `DRAFT -> PUBLISHED <-> HIDDEN`, владение проверяется в
обработчике сценария, хранение через TypeORM в адаптере.

Спецификация в [`docs/spec/`](docs/spec/), контракт REST в [`docs/catalog.openapi.yaml`](docs/catalog.openapi.yaml).

## Как устроен сервис

```
src/main.ts                             точка входа: конфигурация, миграции, сервер, остановка
src/
  core/
    apperr.ts                           ошибки с видом и кодом, общие для ядра и адаптеров
    security/                           Principal из токена, роли
    product/
      aggregate/                        Product: поля закрыты, правила в методах
      port/out/                         интерфейсы: репозиторий, журнал, часы, идентификаторы, единица работы
      usecase/                          команды: создать, сменить цену, опубликовать, скрыть
      query/                            чтение: карточка, мои товары
  adapter/
    in/http/                            контроллеры NestJS, Problem Details, роли в guard, DTO
    out/persistence/                    TypeORM: строки-сущности, миграции, транзакция, журнал
    out/system/                         системные часы и uuid
  bootstrap/                            конфигурация, сборка зависимостей, AppModule
```

Правило одно: `src/core` импортирует только Node.js, `decimal.js` и свои файлы, ни одного `@nestjs/*`,
`typeorm`, `express` или `pg`. Его стережёт `test/architecture.spec.ts`, который читает импорты файлов ядра,
а `implements ProductRepository` в адаптере ловит расхождение порта и реализации на этапе компиляции.

Классы ядра не знают про внедрение зависимостей NestJS: обработчики сценариев собираются фабриками в
`src/bootstrap/wiring.ts`, и это единственное место, где порт встречается со своей реализацией.
Транзакция передаётся явно: единица работы отдаёт обработчику транзакционные порты, а не прячет
соединение в глобальном контексте.

## Запуск

```bash
docker compose -f ../../infra/compose.yaml up -d postgres-catalog-starter
npm install
npm run build && npm start
```

Переменные: `HTTP_PORT` (`3080`), `DATABASE_URL` (`postgres://catalog:catalog@localhost:5450/catalog`),
`AUTH_MODE` (`local` или `jwt`), для `jwt` ещё `JWKS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE`.

В режиме `local` токен это строка `role.uuid`, роли `seller`, `admin`, `customer`:

```bash
SELLER=$(uuidgen | tr A-Z a-z)
curl -s -X POST localhost:3080/api/v1/products -H "Authorization: Bearer seller.$SELLER" \
  -H 'Content-Type: application/json' -d '{"title":"Кофемолка","price":2490.5,"currency":"RUB"}'
```

Карточку в статусе `DRAFT` видят только владелец и администратор; опубликованную видят все без токена.

## Тесты

```bash
npm test
```

Интеграционные тесты идут на настоящей PostgreSQL (`catalog_test` из compose, `TEST_DATABASE_URL`):
приложение поднимается целиком, миграции накатываются при старте, каждый тест чистит таблицы.
Архитектурный тест проверяет направление импортов. `npm test` сначала прогоняет `tsc --noEmit`.

## Коды ошибок

`VALIDATION_ERROR`, `MALFORMED_REQUEST`, `INVALID_PRICE`, `INVALID_CURRENCY`, `PRODUCT_NOT_FOUND`,
`OWN_PRODUCT_REQUIRED` (чужой товар, 404, а не 403), `INVALID_STATE_TRANSITION` (409), `TOKEN_MISSING` (401),
`TOKEN_INVALID` (401), `ACCESS_DENIED` (403). Тело ошибки в формате Problem Details, `type` вида `urn:problem:catalog:<CODE>`.

## Что почитать

- [Catalog Service в кейсе](https://vikulin-va.ru/use-case-pattern/case/catalog-service/) и [Use Case Pattern](https://vikulin-va.ru/use-case-pattern/).
- [Гексагональная архитектура на Node](https://vikulin-va.ru/patterns/hexagonal/node/core-layer/): почему ядро не знает про NestJS и TypeORM.
- [Архитектурные тесты на Node](https://vikulin-va.ru/patterns/hexagonal/node/architecture-tests/).
- [ABAC и владение ресурсом в Node](https://vikulin-va.ru/patterns/auth-patterns/node/abac-resource-ownership/).
- Учебная версия того же сервиса для первых шагов практикума: `../catalog-starter`.
