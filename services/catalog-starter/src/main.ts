import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { fromEnv } from './config/config';

async function main(): Promise<void> {
  const config = fromEnv();
  const app = await NestFactory.create(AppModule.forConfig(config), { logger: ['log', 'warn', 'error'] });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.httpPort);
  new Logger('catalog').log(`каталог слушает :${config.httpPort}`);
}

main().catch((error) => {
  new Logger('catalog').error('сервис остановлен с ошибкой', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
