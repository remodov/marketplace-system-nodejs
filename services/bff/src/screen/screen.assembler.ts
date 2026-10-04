import { DownstreamClient, isNotFound, unreachable } from './downstream.client';

export const PAYMENT_NONE = 'NONE';
export const ORDER = 'order';
export const CATALOG = 'catalog';
export const PAYMENT = 'payment';

export type ScreenItem = {
  productId: string;
  title: string;
  quantity: number;
  price: number;
};

export type OrderScreen = {
  orderId: string;
  status: string;
  total: number;
  paymentStatus: string;
  items: ScreenItem[];
};

export type Neighbours = {
  orderUrl: string;
  catalogUrl: string;
  paymentUrl: string;
};

type OrderLine = {
  productId: string;
  quantity: number;
};

type OrderResponse = {
  id: string;
  status: string;
  total: number;
  paymentId?: string;
  items: OrderLine[];
};

type ProductCard = {
  title: string;
  price: number;
};

type PaymentResponse = {
  status: string;
};

export class ScreenAssembler {
  private readonly order: DownstreamClient;
  private readonly catalog: DownstreamClient;
  private readonly payment: DownstreamClient;

  constructor(urls: Neighbours) {
    this.order = new DownstreamClient(ORDER, urls.orderUrl);
    this.catalog = new DownstreamClient(CATALOG, urls.catalogUrl);
    this.payment = new DownstreamClient(PAYMENT, urls.paymentUrl);
  }

  async assemble(orderId: string, authorization: string | undefined): Promise<OrderScreen> {
    const order = await this.order.getJson<OrderResponse>(`/api/v1/orders/${orderId}`, authorization);
    // TODO шаг 13: собрать экран.
    // Заказ уже прочитан: из него известны товары (order.items) и идентификатор платежа
    // (order.paymentId). Осталось добрать карточки товаров (this.catalog, ответ ProductCard)
    // и статус платежа (this.paymentStatus). Эти походы независимы, и экран не обязан
    // ждать их по очереди.
    throw unreachable(CATALOG, new Error(`шаг 13: экран заказа ${order.id} ещё не собирается`));
  }

  async close(): Promise<void> {
    await Promise.all([this.order.close(), this.catalog.close(), this.payment.close()]);
  }

  private async paymentStatus(paymentId: string | undefined, authorization: string | undefined): Promise<string> {
    if (!paymentId) return PAYMENT_NONE;
    try {
      const payment = await this.payment.getJson<PaymentResponse>(`/api/v1/payments/${paymentId}`, authorization);
      return payment.status;
    } catch (error) {
      if (isNotFound(error, PAYMENT)) return PAYMENT_NONE;
      throw error;
    }
  }
}
