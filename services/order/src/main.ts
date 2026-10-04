import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PaymentEventsConsumer } from './adapter/in/kafka/payment-events.consumer';
import { AppModule } from './bootstrap/app.module';
import { fromEnv, kafkaInUse } from './bootstrap/config';
import { configureApp } from './bootstrap/configure-app';
import { ExpireUnpaid } from './core/order/usecase/expire-unpaid';
import { OutboxRelay } from './core/order/usecase/relay-outbox';

async function main(): Promise<void> {
  const config = fromEnv();
  const app = await NestFactory.create(AppModule.forConfig(config), { logger: ['log', 'warn', 'error'] });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.httpPort);
  app.get(OutboxRelay).run(config.outboxRelayIntervalMs);
  app.get(ExpireUnpaid).run(config.expireIntervalMs);
  if (kafkaInUse(config)) void app.get(PaymentEventsConsumer).run();
  const broker = kafkaInUse(config)
    ? `kafka ${config.kafkaBrokers.join(',')}, топики ${config.kafkaTopic} и ${config.paymentsTopic}`
    : 'без брокера: события только в лог, события платежей не читаем';
  new Logger('order').log(
    `сервис заказов слушает :${config.httpPort}, каталог ${config.catalogUrl}, платежи ${config.paymentUrl}, аутентификация ${config.authMode}, ${broker}, relay раз в ${config.outboxRelayIntervalMs} мс, просрочка оплаты ${config.expireUnpaidAfterMs} мс`,
  );
}

main().catch((error) => {
  new Logger('order').error('сервис остановлен с ошибкой', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
