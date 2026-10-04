import { DynamicModule, Inject, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController, RequestMetrics } from './metrics';
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
    return {
      module: ObservabilityModule,
      controllers: [HealthController, MetricsController],
      providers: [{ provide: OBSERVABILITY_SETTINGS, useValue: settings }, RequestMetrics, DatabaseReadiness, TracingLifecycle],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(this.metrics.middleware(), traced(this.settings.service)).forRoutes('*');
  }
}
