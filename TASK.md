# Шаг 15. Доставка и наблюдаемость

## Что нужно сделать

Сервис написан и работает на ноутбуке. Между этим и «работает в проде» лежит
шаг, который обычно делают в последний день и потому плохо.

**1. Образ.** `services/catalog-starter/Dockerfile`: сборка отдельно от запуска,
чтобы в образ не уезжали `npm`, TypeScript, тесты и dev-зависимости; в рантайм
попадают только `dist/`, `node_modules` без dev-зависимостей (`npm ci --omit=dev`)
и `package.json`; контейнер не должен бежать от root. Контекст сборки это корень
репозитория: `docker build -f services/catalog-starter/Dockerfile .`

**2. Манифесты.** `deploy/k8s/catalog-starter.yaml`:

- пробы готовности и живости: без них кластер считает под готовым сразу и шлёт
  запросы в ещё не поднявшееся приложение;
- запросы и лимиты ресурсов: под без лимитов утягивает узел за собой;
- корректное завершение: под должен успеть уйти из балансировщика раньше, чем
  перестанет отвечать;
- образ с версией, а не `latest`: откатываться на «latest» некуда.

Эталон рядом: `deploy/k8s/bff.yaml`.

**3. Наблюдаемость.** `src/observability/` стартового каталога:
`ObservabilityModule.forRoot` должен поднять пробы `/health/live` и `/health/ready`
(готовность проверяет базу и при недоступной отвечает 503 с кодом `NOT_READY`) и
отдать `/metrics` в формате Prometheus; гистограмма времени ответа обязана нести
метку `service`, иначе в общем Prometheus не отличить, чьё это время; `sampler`
берёт долю трасс из настроек, а не роняет все.

## Где править

`// TODO шаг 15` и `# TODO шаг 15`:

- `services/catalog-starter/Dockerfile`;
- `deploy/k8s/catalog-starter.yaml`;
- `services/catalog-starter/src/observability/observability.module.ts`;
- `services/catalog-starter/src/observability/tracing.ts`.

## Как проверить себя

```bash
python3 tools/check-deploy.py
cd services/catalog-starter
npm install
npx jest test/observability.spec.ts
npm test
```

Скрипт сейчас находит десять замечаний, четыре проверки
`test/observability.spec.ts` красные: обе пробы, метрики с меткой сервиса и
сэмплер. Остальные тесты стартера зелёные и обязаны остаться такими.

Собрать и запустить образ руками: стенд `docker compose -f infra/compose.yaml up -d`,
затем из корня `docker build -f services/catalog-starter/Dockerfile -t catalog-starter-node:0.1.0 .`
и `docker run --rm -p 3082:3082 -e DATABASE_URL=postgres://catalog:catalog@host.docker.internal:5450/catalog_starter -e REDIS_URL=redis://host.docker.internal:6382 -e OTEL_EXPORTER_OTLP_ENDPOINT= catalog-starter-node:0.1.0`.
`curl -i localhost:3082/health/live` должен ответить 204.

## На что посмотреть по дороге

- Разница между пробой готовности и живости: первая отвечает «слать ли мне
  трафик», вторая «не пора ли меня перезапустить». Если перепутать, кластер
  начнёт перезапускать поды, которые просто ещё прогреваются.
- Метрика без метки сервиса бесполезна: в общем Prometheus не отличить, чьё это
  время ответа. А метка `route` обязана быть шаблоном маршрута (`/products/:id`),
  не сырым URL: иначе каждый идентификатор товара станет отдельным рядом. В Express
  шаблон лежит в `req.route.path`, и появляется он только после того, как маршрут
  найден: смотри, в какой момент middleware его читает.
- `distroless/nodejs` не содержит ни оболочки, ни `npm`: `sh -c "sleep 5"` из
  эталона `bff.yaml` в `preStop` там не выполнится, а `npm start` в `CMD` не
  запустится. Подумай, чем заменить и то, и другое (в образе есть сам `node`), и
  зачем тогда `preStop` вообще нужен (ответ в статье про graceful shutdown).
- `npm ci --omit=dev` после `npm run build`, а не до: TypeScript нужен сборке,
  но не рантайму. Сравни размер образа с одностадийным.
- Посмотри пайплайн `.github/workflows/ci.yml`: он гоняет тесты сервисов, тесты
  клиента и эту же проверку выката. Заказы и уведомления в нём не гоняются:
  им нужна Kafka, и они живут на стенде.

## Материал

- Dockerfile для сервиса на Node: https://vikulin-va.ru/docker/node/dockerizing/
- Рантайм в контейнере: https://vikulin-va.ru/docker/node/runtime/
- Kubernetes: https://vikulin-va.ru/kubernetes/
- Пробы: https://vikulin-va.ru/observability/node/health-checks/
- Метрики: https://vikulin-va.ru/observability/node/metrics/
- CI/CD: https://vikulin-va.ru/cicd/
