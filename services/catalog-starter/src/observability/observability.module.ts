import { DynamicModule, Inject, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestMetrics } from './metrics';
import { DatabaseReadiness } from './readiness';
import { OBSERVABILITY_SETTINGS, ObservabilitySettings } from './settings';
import { traced, TracingLifecycle } from './tracing';

@Module({})
export class ObservabilityModule implements NestModule {
  constructor(
    private readonly metrics: RequestMetrics,
    @Inject(OBSERVABILITY_SETTINGS) private readonly settings: ObservabilitySettings,
  ) {}

  static forRoot(settings: ObservabilitySettings): DynamicModule {
    // TODO шаг 15: пробы и метрики.
    // Кластеру нужны /health/live и /health/ready (готовность проверяет базу через DatabaseReadiness
    // и отвечает 503 с кодом NOT_READY), Prometheus нужен /metrics из RequestMetrics.
    // Контроллеры лежат рядом в health.controller.ts и metrics.ts, но в модуль не подключены.
    return {
      module: ObservabilityModule,
      providers: [{ provide: OBSERVABILITY_SETTINGS, useValue: settings }, RequestMetrics, DatabaseReadiness, TracingLifecycle],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(this.metrics.middleware(), traced(this.settings.service)).forRoutes('*');
  }
}
