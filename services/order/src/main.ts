import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './bootstrap/app.module';
import { fromEnv } from './bootstrap/config';
import { configureApp } from './bootstrap/configure-app';
import { OutboxRelay } from './core/order/usecase/relay-outbox';

async function main(): Promise<void> {
  const config = fromEnv();
  const app = await NestFactory.create(AppModule.forConfig(config), { logger: ['log', 'warn', 'error'] });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.httpPort);
  app.get(OutboxRelay).run(config.outboxRelayIntervalMs);
  const broker = config.publisherMode === 'kafka' ? `kafka ${config.kafkaBrokers.join(',')} топик ${config.kafkaTopic}` : 'события только в лог';
  new Logger('order').log(
    `сервис заказов слушает :${config.httpPort}, каталог ${config.catalogUrl}, аутентификация ${config.authMode}, ${broker}, relay раз в ${config.outboxRelayIntervalMs} мс`,
  );
}

main().catch((error) => {
  new Logger('order').error('сервис остановлен с ошибкой', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
