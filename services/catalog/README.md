# catalog

Catalog Service из сквозного маркетплейс-кейса сайта [vikulin-va.ru](https://vikulin-va.ru/use-case-pattern/case/catalog-service/),
взрослая версия учебного `catalog-starter`: те же карточки товаров, но с границами слоёв, спецификацией,
ролями, владением, журналом действий администратора и подписанными ссылками на загрузку фото.

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
      port/out/                         интерфейсы: репозиторий, журнал, часы, идентификаторы, единица работы, хранилище файлов
      usecase/                          команды: создать, сменить цену, опубликовать, скрыть, выдать ссылку на загрузку фото
      query/                            чтение: карточка, мои товары
  adapter/
    in/http/                            контроллеры NestJS, Problem Details, роли в guard, DTO
    out/persistence/                    TypeORM: строки-сущности, миграции, транзакция, журнал
    out/storage/                        S3-клиент: подписанная ссылка на PUT объекта в MinIO
    out/system/                         системные часы и uuid
  bootstrap/                            конфигурация, сборка зависимостей, AppModule
```

Правило одно: `src/core` импортирует только Node.js, `decimal.js` и свои файлы, ни одного `@nestjs/*`,
`typeorm`, `express`, `pg` или `@aws-sdk/*`. Его стережёт `test/architecture.spec.ts`, который читает импорты файлов ядра,
а `implements ProductRepository` в адаптере ловит расхождение порта и реализации на этапе компиляции.

Классы ядра не знают про внедрение зависимостей NestJS: обработчики сценариев собираются фабриками в
`src/bootstrap/wiring.ts`, и это единственное место, где порт встречается со своей реализацией.
Транзакция передаётся явно: единица работы отдаёт обработчику транзакционные порты, а не прячет
соединение в глобальном контексте.

## Запуск

```bash
docker compose -f ../../infra/compose.yaml up -d postgres-catalog-starter minio minio-init
npm install
npm run build && npm start
```

Переменные: `HTTP_PORT` (`3080`), `DATABASE_URL` (`postgres://catalog:catalog@localhost:5450/catalog`),
`AUTH_MODE` (`local` или `jwt`), для `jwt` ещё `JWKS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE`.
Хранилище картинок: `S3_ENDPOINT` (`http://localhost:9002`), `S3_BUCKET` (`marketplace-images`),
`S3_ACCESS_KEY` и `S3_SECRET_KEY` (`marketplace`), `S3_REGION` (`us-east-1`), `IMAGE_UPLOAD_URL_TTL_SECONDS` (`600`).

В режиме `jwt` подпись токена проверяется локально по ключам Keycloak (`jose`, `createRemoteJWKSet`): набор ключей
скачивается один раз и кэшируется, в соседний сервис на каждый запрос каталог не ходит.

В режиме `local` токен это строка `role.uuid`, роли `seller`, `admin`, `customer`:

```bash
SELLER=$(uuidgen | tr A-Z a-z)
curl -s -X POST localhost:3080/api/v1/products -H "Authorization: Bearer seller.$SELLER" \
  -H 'Content-Type: application/json' -d '{"title":"Кофемолка","price":2490.5,"currency":"RUB"}'
```

Карточку в статусе `DRAFT` видят только владелец и администратор; опубликованную видят все без токена.

## Фото товара

Файл через сервис не идёт: владелец просит временную ссылку, а сам файл кладёт браузер прямо в хранилище.
Сервис решает только, кому ссылку выдать: роль `seller` в токене и владение товаром. Чужой товар для
не-владельца выглядит как несуществующий, 404 `OWN_PRODUCT_REQUIRED`.

```bash
curl -s -X POST localhost:3080/api/v1/products/$PRODUCT/image-upload-url -H "Authorization: Bearer seller.$SELLER" \
  -H 'Content-Type: application/json' -d '{"contentType":"image/jpeg"}'
curl -X PUT "$URL_ИЗ_ОТВЕТА" -H 'Content-Type: image/jpeg' --data-binary @photo.jpg
```

Ответ: `key` вида `products/<productId>/<uuid>`, `url` с подписью `X-Amz-Signature` и сроком `X-Amz-Expires`,
`expiresAt`. Подпись считается локально (`@aws-sdk/s3-request-presigner`), в сеть при этом сервис не ходит;
тип содержимого входит в подпись (`X-Amz-SignedHeaders=content-type;host`), так что по ссылке на `image/jpeg`
архив MinIO не примет: 403.

Что загрузилось, видно в консоли MinIO `http://localhost:9003` (логин и пароль `marketplace`), либо из контейнера:

```bash
docker exec mpnode-minio sh -c 'mc alias set local http://localhost:9000 marketplace marketplace >/dev/null && mc ls local/marketplace-images/products/'
```

## Тесты

```bash
npm test
```

Интеграционные тесты идут на настоящей PostgreSQL (`catalog_test` из compose, `TEST_DATABASE_URL`):
приложение поднимается целиком, миграции накатываются при старте, каждый тест чистит таблицы.
Архитектурный тест проверяет направление импортов. `npm test` сначала прогоняет `tsc --noEmit`.
MinIO тестам не нужен: подпись ссылки считается без похода в хранилище.

## Коды ошибок

`VALIDATION_ERROR`, `MALFORMED_REQUEST`, `INVALID_PRICE`, `INVALID_CURRENCY`, `PRODUCT_NOT_FOUND`,
`OWN_PRODUCT_REQUIRED` (чужой товар, 404, а не 403), `INVALID_STATE_TRANSITION` (409), `TOKEN_MISSING` (401),
`TOKEN_INVALID` (401), `ACCESS_DENIED` (403). Тело ошибки в формате Problem Details, `type` вида `urn:problem:catalog:<CODE>`.

## Что почитать

- [Catalog Service в кейсе](https://vikulin-va.ru/use-case-pattern/case/catalog-service/) и [Use Case Pattern](https://vikulin-va.ru/use-case-pattern/).
- [Гексагональная архитектура на Node](https://vikulin-va.ru/patterns/hexagonal/node/core-layer/): почему ядро не знает про NestJS и TypeORM.
- [Архитектурные тесты на Node](https://vikulin-va.ru/patterns/hexagonal/node/architecture-tests/).
- [ABAC и владение ресурсом в Node](https://vikulin-va.ru/patterns/auth-patterns/node/abac-resource-ownership/).
- [Проверка JWT в Node](https://vikulin-va.ru/patterns/auth-patterns/node/jwt-validation/) и [Keycloak](https://vikulin-va.ru/keycloak/).
- [Объектные хранилища](https://vikulin-va.ru/object-storage/fundamentals/) и [выходные адаптеры на Node](https://vikulin-va.ru/patterns/hexagonal/node/adapters-out/).
- Учебная версия того же сервиса для первых шагов практикума: `../catalog-starter`.
