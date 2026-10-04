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
сервисов за прокси Vite. Дальше по [плану](docs/practicum/PLAN.md) - доставка и наблюдаемость.

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

## Как устроен шаг

Ветка `step-NN-<тема>` - задание: каркас на месте, реализация вынута, тест красный,
условие в `TASK.md` внутри сервиса. Ветка `step-NN-<тема>-solution` - эталон.
`main` - накопленный эталон всех шагов.

```bash
git switch step-02-read-endpoint
cd services/catalog-starter && npm test
```

## Что почитать рядом

- [Ядро NestJS](https://vikulin-va.ru/nestjs/modules-and-di/) - модули, провайдеры и внедрение зависимостей, на которых стоит каждый сервис.
- [Хранение данных с TypeORM](https://vikulin-va.ru/nestjs/persistence-typeorm/) - сущности, миграции и транзакции.
- [Use Case Pattern](https://vikulin-va.ru/use-case-pattern/) - как устроены взрослые сервисы второй части.
