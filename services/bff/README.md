# bff

Backend for frontend из сквозного маркетплейс-кейса сайта [vikulin-va.ru](https://vikulin-va.ru/use-case-pattern/case/):
тонкий слой на границе системы. Клиент просит **экран**, а не три ресурса из трёх сервисов: мобильному
приложению три круговые задержки дороже, чем одна. В практикуме на Node появляется на тринадцатом шаге;
сборка экрана и счётчик лимита - задание ученика.

Здесь же живёт то, что положено границе: лимит частоты и внятный ответ, когда сосед не отвечает.
Нарочно простой сервис, как `payment`: один модуль NestJS, без базы и без портов.

```
src/main.ts                      точка входа: конфигурация, HTTP, остановка
src/
  config.ts                      HTTP_PORT, REDIS_URL, адреса соседей, RATE_LIMIT_PER_MINUTE
  app.module.ts                  сборка зависимостей: Redis, часы, лимитер, сборщик экрана; фильтр ошибок
  screen/
    screen.assembler.ts          сборка экрана: заказ, затем карточки товаров и статус платежа параллельно
    downstream.client.ts         походы к соседям на undici с таймаутом и ошибкой DownstreamError
  ratelimit/
    limiter.ts                   счётчик запросов клиента в Redis на минутное окно, общий для всех экземпляров
    rate-limit.guard.ts          429 и Retry-After при превышении, X-RateLimit-Remaining всегда
    redis.ts                     клиент ioredis
  httpapi/
    screen.controller.ts         одна ручка на весь экран
    problem.ts                   Problem Details; недоступный сосед даёт 502, а не пятисотку без объяснений
    health.controller.ts
```

## Ручка

```
GET /api/v1/screens/order/{orderId}
  Authorization: Bearer <токен покупателя>   пересылается соседям как есть
  X-Client-Id: <клиент>                      ключ лимита; без заголовка клиент anonymous
```

```json
{"orderId":"...","status":"PAID","total":3980,"paymentStatus":"CAPTURED",
 "items":[{"productId":"...","title":"Беспроводная мышь","quantity":2,"price":1990}]}
```

Заказ читается первым: из него известны товары и идентификатор платежа. Карточки товаров и статус платежа
добираются через `Promise.all`: экран ждёт самый медленный ответ, а не сумму всех. Платежа может не быть
вовсе: заказ ещё не оплачивали, и это обычное состояние экрана (`paymentStatus: NONE`), а не ошибка.

Токен клиента BFF пересылает соседям как есть: заказ отдаёт только своему покупателю, и решает это сервис
заказов, а не граница. Его ответ пробрасывается: 404 -> `ORDER_NOT_FOUND`, 401 и 403 -> `ORDER_ACCESS_DENIED`.

Ошибки: `VALIDATION_ERROR` (400), `ORDER_ACCESS_DENIED` (401, 403), `ORDER_NOT_FOUND` (404), `RATE_LIMITED`
(429, с `Retry-After`), `DOWNSTREAM_UNAVAILABLE` (502: сосед не ответил за две секунды, лежит или ответил не
тем). Тело в формате Problem Details, `type` вида `urn:problem:bff:<CODE>`.

## Лимит частоты

Счётчик живёт в Redis, а не в памяти процесса: экземпляров границы несколько, и лимит должен быть общим,
иначе он тихо умножается на их число. Ключ `rate:<клиент>:<номер минутного окна>`: `INCR`, на первом
попадании `EXPIRE` на окно; ключ протухает сам, отдельной чистки нет. Каждый ответ несёт
`X-RateLimit-Remaining`, при превышении 429 и `Retry-After`. Если Redis недоступен, guard пропускает запрос
и пишет предупреждение: граница без счётчика лучше границы, которая не отвечает никому.

## Запуск и тесты

```bash
docker compose -f ../../infra/compose.yaml up -d redis
npm install
npm run build && npm start
npm test
```

Переменные: `HTTP_PORT` (`3090`), `REDIS_URL` (`redis://localhost:6382`), `ORDER_URL` (`http://localhost:3081`),
`CATALOG_URL` (`http://localhost:3080`), `PAYMENT_URL` (`http://localhost:3086`), `RATE_LIMIT_PER_MINUTE` (`60`).

Соседи в тестах подменены заглушками на `http.createServer`, Redis нужен настоящий (`TEST_REDIS_URL`, по
умолчанию база `/1` того же Redis со стенда): счётчик и должен быть общим, а не в памяти процесса. Часы в
тестах заморожены, клиенты случайные, поэтому прогоны друг другу не мешают, а ключи протухают сами.

## Сквозной прогон

Проверено руками: `catalog` (3080), `order` (3081), `payment` (3086) и `bff` (3090) из собранных `dist`,
Redis со стенда.

```bash
SELLER=$(uuidgen | tr A-Z a-z); CUSTOMER=$(uuidgen | tr A-Z a-z); ADMIN=$(uuidgen | tr A-Z a-z)
PRODUCT=$(curl -s -X POST localhost:3080/api/v1/products -H "Authorization: Bearer seller.$SELLER" \
  -H 'Content-Type: application/json' -d '{"title":"Беспроводная мышь","price":1990,"currency":"RUB"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
curl -s -o /dev/null -X POST localhost:3080/api/v1/products/$PRODUCT/publish -H "Authorization: Bearer seller.$SELLER"
ORDER=$(curl -s -X POST localhost:3081/api/v1/orders -H "Authorization: Bearer customer.$CUSTOMER" -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"productId\":\"$PRODUCT\",\"sellerId\":\"$SELLER\",\"quantity\":2}],\"shippingAddress\":{\"country\":\"RU\",\"city\":\"Москва\",\"street\":\"Тверская, 1\",\"postalCode\":\"125009\"}}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
curl -s -i -H 'X-Client-Id: demo' -H "Authorization: Bearer customer.$CUSTOMER" localhost:3090/api/v1/screens/order/$ORDER
```

Результат: `200`, `X-RateLimit-Remaining: 59`, экран `DRAFT` на 3980 с названием товара из каталога, ценой
1990 и `paymentStatus: NONE`. После `confirm`, авторизации и списания платежа в `payment` и `POST .../pay`
администратором тот же запрос отдаёт `PAID` и `paymentStatus: CAPTURED`. Чужой покупатель получает
`404 ORDER_NOT_FOUND`, без токена `401 ORDER_ACCESS_DENIED`, не UUID в пути `400 VALIDATION_ERROR`: кому
виден заказ, решил сервис заказов, BFF только пробросил ответ.

Лимит: 61 запрос подряд с `X-Client-Id: burst` дал 60 раз `200` и один `429` с `Retry-After: 60`,
`X-RateLimit-Remaining: 0` и `application/problem+json`; клиент `quiet` в ту же минуту получил `200` и
`X-RateLimit-Remaining: 59`. В Redis лежат ключи `rate:<клиент>:<окно>` с `TTL` под минуту. После `kill`
процесса `payment` экран оплаченного заказа отвечает `502 DOWNSTREAM_UNAVAILABLE`, в логе `bff` строка
`экран не собран на GET /api/v1/screens/order/<id>: payment: fetch failed: ECONNREFUSED`.

## Что почитать

- [Структурные паттерны микросервисов на TypeScript](https://vikulin-va.ru/patterns/node/microservices-structural/): API Gateway, BFF и почему не «универсальный» ресурс.
- [Стили API](https://vikulin-va.ru/api-styles/): откуда берётся проблема трёх запросов.
- [Rate limiting, загрузка файлов и deprecation в NestJS](https://vikulin-va.ru/rest-api/node/rate-limiting-files-deprecation/): 429, `Retry-After` и заголовки остатка.
- [Redis](https://vikulin-va.ru/redis/): счётчики с протуханием.
