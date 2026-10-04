---
type: context-section
context: order-service
parent: "[[order-service]]"
section: stack
tier: C
ucp-level: 3
tags:
  - stack
  - tech/node
  - tech/nestjs
  - tech/typeorm
  - tech/postgres
  - tech/kafka
  - tech/redis
  - tech/ddd
  - bc/order
---

## 17. Стек технологий

### Платформа

- **Node.js 24** и **TypeScript 5** - один пакет, папки `core` / `adapter` / `bootstrap`.
- **NestJS 12** - контроллеры, guard, фильтр исключений и внедрение зависимостей только во входном адаптере и composition root.

### Use Case Pattern

- Команда - тип с полями, обработчик - класс с методом `handle(cmd)`; порты - интерфейсы в `core/order/port/out`.
- Запросы отделены от команд модулем `core/order/query`.

### DDD

- Агрегат `Order` с закрытыми полями и правилами в методах, позиции `Item` внутри агрегата, `Money` и `Address` значениями.

### Хранилище

- **PostgreSQL 16+** - основное хранилище (write-side, Outbox, идемпотентные ключи).
- **TypeORM 1.1 + pg** - строки-сущности в адаптере хранения, строка и агрегат связаны маппером, транзакция через `DataSource.transaction`.
- **Миграции TypeORM** - в `src/adapter/out/persistence/migrations/`, накатываются при старте.

### События

- **Apache Kafka 3.x** - транспорт между сервисами.
- **kafkajs** - продюсер и консьюмер.
- **Outbox-relay** - свой цикл на `SELECT ... FOR UPDATE SKIP LOCKED`.

### Устойчивость

- **opossum** - размыкатель на вызовах Catalog и Payment.
- Повтор с паузой и таймауты - на `undici` и `AbortSignal.timeout`, без сторонних библиотек.

### Безопасность

- **jose** - проверка JWT по JWKS Keycloak; роли из `realm_access.roles`.
- Локальный режим `AUTH_MODE=local` - токен вида `role.uuid` для тестов и стенда.

### Наблюдаемость

- **Logger NestJS** - структурные логи.
- **OpenTelemetry** - метрики и трассировка (добавляются на шаге про наблюдаемость).

### Тесты

- **Jest** и **supertest** - интеграционные тесты на настоящей PostgreSQL, соседние сервисы подменяются локальным `http.createServer`.
- Архитектурный тест читает импорты файлов `src/core` и стережёт направление зависимостей.

### Инфраструктура

- **Docker Compose** - стенд в `infra/compose.yaml`.
- **Kubernetes** - деплой на шаге про инфраструктуру.
