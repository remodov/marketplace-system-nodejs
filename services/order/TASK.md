# Шаг 10. Событие: outbox и внешний контракт

## Что нужно сделать

Заказ создан, и об этом должны узнать соседи: уведомления шлёт `notification`,
платёжное намерение потом создаст `payment`. Отправить событие прямо из кода
нельзя: если запись в базу прошла, а отправка в Kafka упала, событие потеряно
навсегда; если наоборот, соседи узнают о заказе, которого нет.

Отсюда outbox: событие пишется **в ту же транзакцию**, что и заказ, обычной
строкой в таблицу. Дальше фоновый цикл (relay) забирает неотправленные строки и
публикует их. Падение между записью и отправкой ничего не теряет: строка
осталась, relay заберёт её на следующем круге.

Вторая половина шага - **что именно** уезжает в этой строке.

## Задачи

1. **Запись в outbox.** `TypeOrmOutbox.append` кладёт каждое событие строкой:
   идентификатор, агрегат, тип, версия, payload, время. `published_at` остаётся
   пустым - это признак «ещё не отправлено». Метод вызывается внутри
   `UnitOfWork.within` как `tx.outbox.append(order.pullEvents())`, и строка
   должна уйти тем же `EntityManager`, что и заказ.
2. **Внешний контракт.** Payload это договор с чужими сервисами, а не дамп
   внутреннего типа. `payloadOf` собирает `OrderCreatedPayload` из пакета
   `@marketplace/contracts-orders-v1` (`contracts/orders/v1`): `customerId` и
   `sellerId` строками UUID, сумма десятичной строкой, `itemsCount` числом,
   `occurredAt` в ISO 8601 - и ничего сверх контракта.
3. **Relay.** `OutboxRelay.once` в одной транзакции берёт пачку неотправленных
   строк, публикует каждую через порт `ExternalEventPublisher` и помечает
   отправленной. Если брокер отказал, транзакция откатывается целиком и строки
   остаются. Цикл `run` с таймером и остановка `stop` уже есть.

## Где править

`// TODO шаг 10`:

- `src/adapter/out/persistence/outbox.repository.ts` - `append` и `payloadOf`;
- `src/core/order/usecase/relay-outbox.ts` - `once`.

Порт `EventOutbox` (`append`, `unpublished`, `markPublished`) и порт
`ExternalEventPublisher` уже описаны в `src/core/order/port/out/ports.ts`.
`unpublished` и `markPublished` реализованы, издатель на kafkajs лежит в
`src/adapter/out/kafka/kafka.publisher.ts`, издатель в лог - в
`src/adapter/out/system/log.publisher.ts`.

## Как проверить себя

Нужны PostgreSQL и Kafka из стенда:

```bash
docker compose -f ../../infra/compose.yaml up -d postgres-catalog-starter kafka
npm install
npm test
```

Красные проверки в `test/outbox.spec.ts`:

- строка outbox рождается вместе с заказом и ещё не отправлена;
- поля payload ровно те, что во внешнем контракте;
- повтор идемпотентного запроса не рождает второе событие;
- relay публикует неотправленные строки и помечает их;
- при лежащем брокере relay бросает ошибку, а строка остаётся неотправленной.

`test/kafka-publisher.spec.ts` проверяет издателя на настоящей Kafka со стенда:
публикует сообщение и читает его консьюмером kafkajs с уникальной группой. Если
брокер не поднят, проверка пропускается с предупреждением в консоли.

Потом сквозной прогон: подними `catalog`, `order` и `notification`, создай заказ
и спроси `notification` список уведомлений покупателя (как - в README сервиса,
раздел «Сквозной прогон»).

## На что посмотреть по дороге

- Эта грабля настоящая, а не выдуманная: в Java-версии `customerId` уезжал в
  Kafka вложенным объектом `{"value": "..."}`, потребитель читал его строкой и
  падал, адресат уведомления не определялся вовсе. На Node та же грабля выглядит
  как `JSON.stringify(event)` внутреннего события: в тело уезжают поле `type`,
  `total` объектом `{"amount":"4981","currency":"RUB"}`, массив `items` и всё,
  что кто-то когда-нибудь добавит в тип. Тест «payload не по контракту
  отклоняется» в `notification` показывает, что потребитель с таким payload
  делает.
- Почему нельзя просто отдать наружу свой тип: внутренний тип свободно меняют
  при рефакторинге, а контракт менять нельзя, на нём висят чужие сервисы.
  Контракт лежит в `contracts/` в формате AsyncAPI, посмотри, как там описан
  `OrderCreatedPayload`, и сравни с типом в `contracts/orders/v1/events.d.ts`.
- Relay помечает строку отправленной **после** успешной публикации. Что будет,
  если пометить до? А если Kafka приняла, но пометка не записалась?
- Из предыдущего вопроса растёт правило для потребителя: доставка бывает
  повторной, и второе письмо покупателю слать нельзя. Как `notification` это
  ловит? Посмотри `services/notification/src/inbox`.
- `FOR UPDATE SKIP LOCKED`: два экземпляра сервиса заказов не возьмут одну
  строку дважды. А что будет без `SKIP LOCKED`?
- Грабли kafkajs: заголовки приходят потребителю как `Buffer`, сравнивать их со
  строкой без `toString()` бесполезно; при `autoCommit: false` коммитить надо
  `offset + 1`, Kafka хранит следующий к чтению, а не последний прочитанный;
  продюсер без явного `createPartitioner` пишет предупреждение о смене
  партиционера в 2.0; предупреждение `TimeoutNegativeWarning` на Node 24 идёт из
  внутренней очереди запросов kafkajs и на работу не влияет.

## Материал

- Kafka на Node с нуля: https://vikulin-va.ru/kafka/node/fundamentals/
- Распределённые паттерны на Node, outbox и идемпотентный потребитель: https://vikulin-va.ru/patterns/node/distributed-patterns/
- Фоновые задачи и outbox-relay при остановке: https://vikulin-va.ru/graceful-shutdown/node/scheduled-async-outbox/
- Kafka на Node в production, заголовки и commit offset: https://vikulin-va.ru/kafka/node/production-essentials/
