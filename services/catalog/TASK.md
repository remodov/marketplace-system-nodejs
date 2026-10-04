# Шаг 7. Тот же каталог, но по-взрослому

Рядом с учебным `catalog-starter` лежит `services/catalog` - тот же сервис, собранный так,
как его собирают в большой системе: ядро без импортов NestJS и TypeORM, порты интерфейсами,
спецификация в `docs/spec/`, роли и владение, журнал действий администратора.

## Часть первая: сравнить

Откройте оба сервиса и ответьте письменно (хватит десяти строк в `docs/COMPARISON.md`):

1. Что в `services/catalog` стало возможным, чего в `catalog-starter` не было?
   Подсказка: тест ядра без базы, второй вход (Kafka), смена хранилища, проверка границ.
2. Чего это стоило: сколько файлов нужно открыть, чтобы добавить поле в карточку, здесь и там.
3. При каком размере команды и сервиса вы бы остались на простой раскладке.

## Часть вторая: перенести смену цены

Смена цены из шага 3 в этом сервисе вынута. Шесть тестов в `test/change-price.spec.ts`
красные. Верните команду по слоям:

- `src/core/product/usecase/change-product-price.ts` - команда `ChangeProductPrice`
  и обработчик `ChangeProductPriceHandler`; смотрите на `change-status.ts` как на образец:
  единица работы, строка под `FOR UPDATE`, владение через `requireOwnership`, журнал для администратора.
- `src/core/product/aggregate/product.ts` - метод `changePrice`: правило BR-P01, цена больше нуля,
  округление до копеек, `updatedAt`.
- `src/adapter/in/http/product.controller.ts` - маршрут `PATCH /api/v1/products/:productId/price`:
  обработчик в конструкторе, роли `seller` и `admin`, тело `ChangePriceRequest` (ноль - `VALIDATION_ERROR`
  до вызова ядра), ответ DTO.
- `src/bootstrap/wiring.ts` - собрать `ChangeProductPriceHandler` из часов, генератора идентификаторов
  и единицы работы, чтобы NestJS смог отдать его контроллеру.

Места отмечены `TODO шаг 7`.

## Проверка

```bash
cd services/catalog && npm test
```

Зелёными должны стать шесть тестов `change-price.spec.ts` и остаться зелёными архитектурные:
если смена цены потянула в ядро `typeorm` или `@nestjs/common`, первым упадёт
«ядро зависит только от себя и стандартной библиотеки» в `test/architecture.spec.ts`.

## Куда смотреть

- [Use Case Pattern](https://vikulin-va.ru/use-case-pattern/) - почему команда и обработчик, а не сервис с методами.
- [Core слой на Node](https://vikulin-va.ru/patterns/hexagonal/node/core-layer/) и [порты](https://vikulin-va.ru/patterns/hexagonal/node/ports/).
- [Архитектурные тесты на Node](https://vikulin-va.ru/patterns/hexagonal/node/architecture-tests/) - как тест читает импорты и что считать нарушением.
- [ABAC и владение ресурсом в Node](https://vikulin-va.ru/patterns/auth-patterns/node/abac-resource-ownership/) - почему чужой товар это 404.
- [Журнал действий администратора в Node](https://vikulin-va.ru/patterns/auth-patterns/node/audit-admin/).
- [Сквозной кейс маркетплейса](https://vikulin-va.ru/use-case-pattern/case/) - место каталога среди соседей.
