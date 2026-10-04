import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './bootstrap/app.module';
import { fromEnv } from './bootstrap/config';
import { configureApp } from './bootstrap/configure-app';

async function main(): Promise<void> {
  const config = fromEnv();
  const app = await NestFactory.create(AppModule.forConfig(config), { logger: ['log', 'warn', 'error'] });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.httpPort);
  new Logger('order').log(`сервис заказов слушает :${config.httpPort}, каталог ${config.catalogUrl}, аутентификация ${config.authMode}`);
}

main().catch((error) => {
  new Logger('order').error('сервис остановлен с ошибкой', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
