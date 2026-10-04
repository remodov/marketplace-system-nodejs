# Веб-клиент маркетплейса

Витрина, корзина, оформление и статус заказа поверх BFF. Приложение нарочно
маленькое: смысл не в вёрстке, а в двух вещах, которые обычно делают позже
и криво.

**Первое.** Клиент ходит в одну ручку экрана, а не в три сервиса: `/api/v1/screens/order/{id}`.
**Второе.** Приложение считает воронку: сколько людей увидело карточку, сколько
положило в корзину, сколько начало оформление, сколько оплатило. Без этих чисел
разговор о продукте превращается в спор о вкусах.

Клиент один на все языки практикума: тот же код лежит в [Java-](https://github.com/remodov/marketplace-system)
и [Go-версии](https://github.com/remodov/marketplace-system-go), отличаются только порты сервисов.

## Запустить

```bash
npm install
npm run dev
```

В разработке Vite сам играет роль шлюза: `/api/v1/products` уходит в каталог (3080),
`/api/v1/orders` в заказы (3081), `/api/v1/screens` в BFF (3090). Для сборки адрес API
задаётся переменной `VITE_API_URL`. Токен покупателя для стенда в режиме `AUTH_MODE=local`
берётся из `VITE_CUSTOMER_TOKEN` (по умолчанию `customer.00000000-0000-0000-0000-000000000001`).

Стенд целиком: `docker compose -f ../infra/compose.yaml up -d`, затем в `services/catalog`,
`services/order`, `services/payment` и `services/bff` по `npm run build && npm start`
(порты и переменные - в [корневом README](../README.md)). Товар на витрине появляется
после публикации продавцом (`POST /api/v1/products/{id}/publish`).

## Тесты

```bash
npm test
```

Сеть подменяется заглушкой, браузер не нужен.

## Что внутри

| файл | зачем |
|---|---|
| `src/funnel/funnel.ts` | шаги воронки, отправка событий и расчёт конверсии |
| `src/api/marketplace.ts` | походы в BFF, включая `Idempotency-Key` при создании заказа |
| `src/components/Shop.tsx` | каталог -> корзина -> оформление -> статус |

## Сквозной прогон

Проверено руками: `catalog` (3080), `order` (3081), `payment` (3086) и `bff` (3090) из собранных `dist`,
стенд из compose, `npm run dev` в `web/`.

```bash
SELLER=$(uuidgen | tr A-Z a-z)
PRODUCT=$(curl -s -X POST localhost:3080/api/v1/products -H "Authorization: Bearer seller.$SELLER" \
  -H 'Content-Type: application/json' -d '{"title":"Беспроводная мышь","price":1990,"currency":"RUB"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
curl -s localhost:5173/api/v1/products
curl -s -o /dev/null -X POST localhost:3080/api/v1/products/$PRODUCT/publish -H "Authorization: Bearer seller.$SELLER"
curl -s localhost:5173/api/v1/products
```

Результат: до публикации черновика на витрине нет, после публикации он первый в списке (`total` вырос
на один), и всё это через прокси Vite на 5173, а не напрямую в каталог. Дальше теми же функциями
`src/api/marketplace.ts` (`loadCatalog`, `createOrder`, `loadOrderScreen`, запущены через `vite-node` с
`VITE_API_URL=http://localhost:5173`): заказ на две мыши создан с `Idempotency-Key` и токеном покупателя
по умолчанию, экран через `/api/v1/screens/order/{id}` отдал `DRAFT`, `total: 3980`, `paymentStatus: NONE`
с названием товара из каталога. После `confirm`, авторизации и списания в `payment` и `POST .../pay`
администратором тот же экран отдал `PAID` и `paymentStatus: CAPTURED`: именно по этому статусу компонент
отмечает последний шаг воронки, а не по нажатию кнопки.

## Что почитать

- [Frontend](https://vikulin-va.ru/frontend/): React и TypeScript по делу.
- [Выпустить и измерить](https://vikulin-va.ru/product-engineer/ship-and-measure/): зачем разработчику продуктовые числа.
- [Тестирование в NestJS](https://vikulin-va.ru/nestjs/testing/): что проверять на клиенте и на сервере.
