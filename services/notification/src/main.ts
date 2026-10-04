import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, configureApp } from './app.module';
import { fromEnv } from './config';
import { OrderEventsConsumer } from './consumer/order-events.consumer';

async function main(): Promise<void> {
  const config = fromEnv();
  const app = await NestFactory.create(AppModule.forConfig(config), { logger: ['log', 'warn', 'error'] });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.httpPort);
  void app.get(OrderEventsConsumer).run();
  new Logger('notification').log(
    `сервис уведомлений слушает :${config.httpPort}, kafka ${config.kafkaBrokers.join(',')}, группа ${config.kafkaGroup}, топик ${config.kafkaTopic}`,
  );
}

main().catch((error) => {
  new Logger('notification').error('сервис остановлен с ошибкой', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
