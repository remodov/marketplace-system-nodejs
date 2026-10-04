# Маркетплейс на Node.js: сквозная система для практики

Та же система, что в [практикуме на Java](https://github.com/remodov/marketplace-system) и
[на Go](https://github.com/remodov/marketplace-system-go): маркетплейс из разбора
[«Как разбить систему на сервисы»](https://vikulin-va.ru/use-case-pattern/case/services-map/),
только написанный на TypeScript и NestJS. Репозиторий - практическая часть программы
[«Backend · Node»](https://vikulin-va.ru/programs/backend-node/) с
[vikulin-va.ru](https://vikulin-va.ru/): каждый шаг практикума привязан к статьям,
которые закрывают его тему.

## Что внутри

| сервис | отвечает за | стек |
|---|---|---|
| `services/catalog-starter` | карточки товаров, остатки, резерв, поиск | NestJS, TypeORM, миграции TypeORM, Redis |
| `services/catalog` | те же карточки по-взрослому: слои, спецификация, роли, владение, журнал администратора | NestJS, TypeORM, jose, архитектурные тесты |
| `services/order` | заказы: черновик с ценами из каталога, клиент каталога с таймаутами, повтором и размыкателем, идемпотентность, outbox, статусная модель и сага отмены | NestJS, TypeORM, undici, opossum, kafkajs |
| `services/payment` | платежи: автомат статусов, одна авторизация на заказ, безопасный повторный возврат | NestJS, `pg` без ORM |
| `services/notification` | уведомления: потребитель событий заказа с защитой от повторной доставки | NestJS, TypeORM, kafkajs |
| `services/bff` | граница системы: экран заказа одним запросом из трёх сервисов, лимит частоты на клиента в Redis | NestJS, undici, ioredis |
| `contracts` | внешние контракты событий заказа и платежа: AsyncAPI, схемы и пакеты типов для продюсера и потребителей | AsyncAPI 3, TypeScript |
| `web` | веб-клиент: витрина опубликованных товаров, корзина, оформление с `Idempotency-Key`, экран заказа через BFF, воронка покупки | React 19, Vite, vitest, Testing Library |

Контракты событий лежат в [`contracts/`](contracts/README.md): AsyncAPI-документы, схемы полей и пакеты
`@marketplace/contracts-orders-v1` и `@marketplace/contracts-payments-v1`, которые сервисы подключают зависимостью
`file:`, так что продюсер и потребитель компилируются против одних типов. Веб-клиент в [`web/`](web/README.md)
один на все языки практикума: тот же TypeScript, что в Java- и Go-версиях, отличаются только порты
сервисов за прокси Vite. Последний шаг [плана](docs/practicum/PLAN.md) - доставка и наблюдаемость:
образ стартового каталога, манифесты Kubernetes, пробы, метрики, трассы и пайплайн, см. ниже.

## С чего начинать

[`services/catalog-starter`](services/catalog-starter/README.md): контроллер -> сервис ->
репозиторий, одна таблица, SQL руками там, где он важен. Клонировал, поднял базу, запустил,
увидел товар.

Нужны Node.js 24 (в корне лежит `.nvmrc`) и Docker.

```bash
git clone git@github.com:remodov/marketplace-system-nodejs.git
cd marketplace-system-nodejs
docker compose -f infra/compose.yaml up -d postgres-catalog-starter redis
cd services/catalog-starter
npm install
npm test
npm run build && npm start
```

## Поднять стенд

```bash
docker compose -f infra/compose.yaml up -d
docker compose -f infra/compose.yaml ps
```

| что | порт | зачем |
|---|---|---|
| PostgreSQL | 5450 | базы `catalog_starter`, `catalog`, `orders`, `notifications` и `payments` плюс тестовые `*_test` |
| Redis | 6382 | кэш карточек, шаг 6; счётчик лимита частоты в BFF, шаг 13 |
| Kafka | 9095 | события заказа из outbox, шаг 10; события платежа, шаг 11 |
| MinIO | 9002, 9003 | изображения товаров, шаг 12 |

Порты сдвинуты относительно Java- и Go-версий, чтобы три стенда могли жить на одной машине.

## Запустить клиент

Клиенту нужны `catalog` (3080), `order` (3081), `payment` (3086) и `bff` (3090): в каждом
`npm install && npm run build && npm start`. Затем:

```bash
cd web
npm install
npm run dev
```

Vite на `http://localhost:5173` сам проксирует `/api/v1/products` в каталог, `/api/v1/orders`
в заказы и `/api/v1/screens` в BFF, так что шлюз для разработки не нужен. Товар на витрине
появляется после публикации продавцом.

## Собрать образ и выкатить

Образ стартового каталога собирается из корня репозитория в два этапа: на `node:24-alpine`
компилируется `dist/` и ставятся зависимости без dev, в рантайм `distroless/nodejs24` без
оболочки и `npm` уезжают только `dist/`, `node_modules` и `package.json`, контейнер бежит
от `nonroot`.

```bash
docker build -f services/catalog-starter/Dockerfile -t catalog-starter-node:0.1.0 .
docker run --rm -p 3082:3082 \
  -e DATABASE_URL=postgres://catalog:catalog@host.docker.internal:5450/catalog_starter \
  -e REDIS_URL=redis://host.docker.internal:6382 \
  -e OTEL_EXPORTER_OTLP_ENDPOINT= \
  catalog-starter-node:0.1.0
curl -s -o /dev/null -w '%{http_code}\n' localhost:3082/health/live
```

Манифесты Kubernetes лежат в `deploy/k8s/`: `catalog-starter.yaml` и эталонный `bff.yaml` с
пробами готовности и живости, запросами и лимитами, `runAsNonRoot`, `preStop` и образом с версией.
Сервис отдаёт `/health/live`, `/health/ready` (проверяет базу, при недоступной отвечает 503 с
кодом `NOT_READY`) и `/metrics` в формате Prometheus с гистограммой времени ответа по шаблонам
маршрутов; трассы уходят в OTLP по `OTEL_EXPORTER_OTLP_ENDPOINT` с долей `TRACE_SAMPLE_RATIO`.

Пайплайн `.github/workflows/ci.yml` на каждый push в `main` и pull request поднимает PostgreSQL
и Redis, гоняет `npm test` в `catalog-starter`, `catalog`, `payment` и `bff` (заказам и
уведомлениям нужна Kafka, они живут на стенде), тесты клиента в `web/` и проверку выката
`python3 tools/check-deploy.py`: пробы, лимиты, `runAsNonRoot`, `preStop`, тег образа, две стадии
сборки, образ без dev-зависимостей и исходников.

## Как устроен шаг

Ветка `step-NN-<тема>` - задание: каркас на месте, реализация вынута, тест красный,
условие в `TASK.md` внутри сервиса (шаг 15 трогает весь репозиторий, его условие лежит в корне).
Ветка `step-NN-<тема>-solution` - эталон. `main` - накопленный эталон всех шагов.

```bash
git switch step-02-read-endpoint
cd services/catalog-starter && npm test
```

## Что почитать рядом

- [Ядро NestJS](https://vikulin-va.ru/nestjs/modules-and-di/) - модули, провайдеры и внедрение зависимостей, на которых стоит каждый сервис.
- [Хранение данных с TypeORM](https://vikulin-va.ru/nestjs/persistence-typeorm/) - сущности, миграции и транзакции.
- [Use Case Pattern](https://vikulin-va.ru/use-case-pattern/) - как устроены взрослые сервисы второй части.
- [Dockerfile для сервиса на Node](https://vikulin-va.ru/docker/node/dockerizing/) и [пробы](https://vikulin-va.ru/observability/node/health-checks/) - образ, манифесты и наблюдаемость последнего шага.
