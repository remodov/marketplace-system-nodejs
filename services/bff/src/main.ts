import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, configureApp } from './app.module';
import { fromEnv } from './config';

async function main(): Promise<void> {
  const config = fromEnv();
  const app = await NestFactory.create(AppModule.forConfig(config), { logger: ['log', 'warn', 'error'] });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.httpPort);
  new Logger('bff').log(
    `bff слушает :${config.httpPort}, заказы ${config.orderUrl}, каталог ${config.catalogUrl}, платежи ${config.paymentUrl}, Redis ${config.redisUrl}, лимит ${config.requestsPerMinute} запросов в минуту на клиента`,
  );
}

main().catch((error) => {
  new Logger('bff').error('сервис остановлен с ошибкой', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
