# Каталог: учебная версия на NestJS

Каталог маркетплейса, написанный так, как пишут обычный NestJS-сервис: контроллер ->
сервис -> репозиторий, сущность TypeORM, миграции TypeORM, SQL руками там, где важно
видеть, что ушло в базу. С этого начинается практикум.

## Запустить

```bash
docker compose -f ../../infra/compose.yaml up -d postgres-catalog-starter redis
npm install
npm run build && npm start
```

Сервис поднимется на 3082, схему накатят миграции при старте.

```bash
curl -s localhost:3082/products
curl -s -X POST localhost:3082/products -H 'Content-Type: application/json' \
  -d '{"title":"Беспроводная мышь","price":1990.00,"stock":7}'
curl -s -X POST localhost:3082/products/<id>/reserve -H 'Content-Type: application/json' \
  -d '{"quantity":2}'
```

Настройки - переменные окружения: `HTTP_PORT` (`3082`), `DATABASE_URL`
(база из compose на 5450), `CACHE` (`redis` или `memory`), `REDIS_URL`,
`SERVICE_NAME` (`catalog-starter`, метка `service` в метриках и `service.name` в трассах),
`OTEL_EXPORTER_OTLP_ENDPOINT` (`http://localhost:4318`, пустое значение выключает отправку трасс),
`TRACE_SAMPLE_RATIO` (доля трасс от 0 до 1, по умолчанию `1.0`).

## Собрать образ

Контекст сборки - корень репозитория, образ в два этапа: сборка на `node:24-alpine`,
рантайм `distroless/nodejs24` без оболочки и `npm`, от пользователя `nonroot`.

```bash
cd ../..
docker build -f services/catalog-starter/Dockerfile -t catalog-starter-node:0.1.0 .
docker run --rm -p 3082:3082 \
  -e DATABASE_URL=postgres://catalog:catalog@host.docker.internal:5450/catalog_starter \
  -e REDIS_URL=redis://host.docker.internal:6382 \
  -e OTEL_EXPORTER_OTLP_ENDPOINT= \
  catalog-starter-node:0.1.0
curl -s -o /dev/null -w '%{http_code}\n' localhost:3082/health/live
curl -s -o /dev/null -w '%{http_code}\n' localhost:3082/health/ready
curl -s localhost:3082/metrics | grep http_server_request_duration_seconds_count
```

Манифест для кластера - `deploy/k8s/catalog-starter.yaml`, проверка выката - `python3 tools/check-deploy.py`
из корня.

## Прогнать тесты

```bash
npm test
```

Тесты идут на настоящем PostgreSQL - на второй базе того же контейнера
(`catalog_starter_test`, `TEST_DATABASE_URL`). Так они проверяют и SQL,
и блокировки, которых в памяти не увидеть. `npm test` сначала прогоняет
`tsc --noEmit`: часть проверок практикума делает компилятор, а не Jest.

## Что внутри

| файл | зачем |
|---|---|
| `src/product/product.entity.ts` | сущность `Product` и единственное бизнес-правило: нельзя зарезервировать больше, чем есть |
| `src/product/product.repository.ts` | выборки через query builder, вставка и обновление с проверкой версии SQL руками |
| `src/product/product.service.ts` | сценарии: найти, создать, зарезервировать |
| `src/product/product.controller.ts` | REST: `GET /products`, `GET /products/:id`, `POST /products`, `POST /products/:id/reserve` |
| `src/product/product.dto.ts` | проверка входа через class-validator с сообщениями по полям |
| `src/http/problem.ts` | тело ошибки в формате Problem Details, коды 400, 404 и 409 |
| `src/migrations` | миграции TypeORM, применяются при старте |
| `src/observability` | пробы `/health/live` и `/health/ready`, `/metrics` на `prom-client` с гистограммой времени ответа по шаблонам маршрутов, трассы OpenTelemetry в OTLP с сэмплированием по доле |

Правило, вокруг которого всё крутится, живёт в сущности, а не в сервисе:

```ts
reserve(quantity: number): void {
  if (quantity > this.stock) throw new OutOfStockError(this.id, quantity, this.stock);
  this.stock -= quantity;
}
```

Поля `Product` закрыты (`private`): менять остаток снаружи нечем, правило нельзя обойти,
и это проверяет компилятор. Это первый шаг к тому, что дальше в программе называется
доменной моделью.
