import { Agent, fetch } from 'undici';
import { AppError, conflict, unavailable } from '../../../core/apperr';
import { PaymentGateway, RefundRequest } from '../../../core/order/port/out/ports';

export type PaymentSettings = {
  baseUrl: string;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
};

type RefundResponse = {
  id: string;
  status: string;
};

export class PaymentClient implements PaymentGateway {
  private readonly agent: Agent;

  constructor(private readonly settings: PaymentSettings) {
    this.agent = new Agent({ connect: { timeout: settings.connectTimeoutMs } });
  }

  async requestRefund(refund: RefundRequest): Promise<string> {
    const response = await this.send(refund);
    if (response.status !== 200) {
      await response.body?.cancel();
      throw refusalOf(response.status);
    }
    const refunded = (await response.json()) as RefundResponse;
    if (refunded.status !== 'REFUNDED') throw conflict('REFUND_REJECTED', `Платёж не возвращён: статус ${refunded.status}`);
    return refunded.id;
  }

  async close(): Promise<void> {
    await this.agent.close();
  }

  private async send(refund: RefundRequest) {
    try {
      return await fetch(`${this.settings.baseUrl}/api/v1/payments/${refund.paymentId}/refund`, {
        method: 'POST',
        dispatcher: this.agent,
        signal: AbortSignal.timeout(this.settings.requestTimeoutMs),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': refund.idempotencyKey },
        body: JSON.stringify({ orderId: refund.orderId, amount: refund.amount.amount.toNumber(), currency: refund.amount.currency }),
      });
    } catch (error) {
      throw degraded(error);
    }
  }
}

function refusalOf(status: number): AppError {
  if (status === 404) return conflict('PAYMENT_NOT_FOUND', 'Платёж по заказу не найден в сервисе платежей');
  if (status === 409) return conflict('REFUND_REJECTED', 'Сервис платежей отказал в возврате');
  return degraded(new Error(`платежи ответили ${status}`));
}

function degraded(cause: unknown): AppError {
  return unavailable('SERVICE_DEGRADED', 'Сервис платежей временно недоступен', cause);
}
