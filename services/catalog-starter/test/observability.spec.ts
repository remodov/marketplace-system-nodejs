import { sampler } from '../src/observability/tracing';
import { Stand, stand } from './support';

let s: Stand;
beforeAll(async () => {
  s = await stand();
});
afterAll(() => s.close());

test('проба готовности отвечает 204', async () => {
  await s.call('get', '/health/ready').expect(204);
});

test('проба живости отвечает 204', async () => {
  await s.call('get', '/health/live').expect(204);
});

test('метрики Prometheus несут метку сервиса и шаблон маршрута', async () => {
  await s.call('get', '/products').expect(200);

  const res = await s.call('get', '/metrics').expect(200);

  for (const part of ['http_server_request_duration_seconds', 'service="catalog-starter"', 'route="/products"']) {
    expect(res.text).toContain(part);
  }
});

test('сэмплер берёт все трассы при доле 1.0', () => {
  expect(sampler(1.0).toString()).toContain('TraceIdRatioBased{1}');
});
