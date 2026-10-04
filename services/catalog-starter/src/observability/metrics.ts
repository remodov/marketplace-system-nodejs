import { Controller, Get, Header, Inject, Injectable } from '@nestjs/common';
import { RequestHandler } from 'express';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';
import { routeOf } from './route';
import { OBSERVABILITY_SETTINGS, ObservabilitySettings } from './settings';

type RequestLabel = 'service' | 'method' | 'route' | 'status';

@Injectable()
export class RequestMetrics {
  private readonly registry = new Registry();
  private readonly duration: Histogram<RequestLabel>;

  constructor(@Inject(OBSERVABILITY_SETTINGS) private readonly settings: ObservabilitySettings) {
    this.duration = new Histogram({
      name: 'http_server_request_duration_seconds',
      help: 'Время ответа HTTP по маршрутам',
      labelNames: ['service', 'method', 'route', 'status'],
      registers: [this.registry],
    });
    collectDefaultMetrics({ register: this.registry });
  }

  middleware(): RequestHandler {
    return (req, res, next) => {
      const started = process.hrtime.bigint();
      res.on('finish', () => {
        const seconds = Number(process.hrtime.bigint() - started) / 1e9;
        this.duration.labels(this.settings.service, req.method, routeOf(req), String(res.statusCode)).observe(seconds);
      });
      next();
    };
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}

@Controller()
export class MetricsController {
  constructor(private readonly metrics: RequestMetrics) {}

  @Get('metrics')
  @Header('Content-Type', Registry.PROMETHEUS_CONTENT_TYPE)
  render(): Promise<string> {
    return this.metrics.render();
  }
}
