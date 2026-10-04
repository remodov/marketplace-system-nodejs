import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, ParentBasedSampler, Sampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_RESPONSE_STATUS_CODE, ATTR_HTTP_ROUTE, ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { RequestHandler } from 'express';
import { routeOf } from './route';
import { OBSERVABILITY_SETTINGS, ObservabilitySettings } from './settings';

export function sampler(ratio: number): Sampler {
  return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) });
}

export function tracing(settings: ObservabilitySettings): NodeTracerProvider {
  const exporter = new OTLPTraceExporter({ url: `${settings.otlpEndpoint}/v1/traces` });
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: settings.service }),
    sampler: sampler(settings.sampleRatio),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();
  return provider;
}

export function traced(service: string): RequestHandler {
  const tracer = trace.getTracer(service);
  return (req, res, next) => {
    const parent = propagation.extract(context.active(), req.headers);
    const span = tracer.startSpan(req.method, { kind: SpanKind.SERVER, attributes: { [ATTR_HTTP_REQUEST_METHOD]: req.method } }, parent);
    res.on('finish', () => {
      const route = routeOf(req);
      span.updateName(`${req.method} ${route}`);
      span.setAttributes({ [ATTR_HTTP_ROUTE]: route, [ATTR_HTTP_RESPONSE_STATUS_CODE]: res.statusCode });
      if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
    });
    context.with(trace.setSpan(parent, span), next);
  };
}

@Injectable()
export class TracingLifecycle implements OnModuleInit, OnApplicationShutdown {
  private provider?: NodeTracerProvider;

  constructor(@Inject(OBSERVABILITY_SETTINGS) private readonly settings: ObservabilitySettings) {}

  onModuleInit(): void {
    if (this.settings.otlpEndpoint === '') return;
    this.provider = tracing(this.settings);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.provider?.shutdown();
  }
}
