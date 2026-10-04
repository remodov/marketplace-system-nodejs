import { DownstreamClient, isNotFound } from './downstream.client';

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
    const [items, paymentStatus] = await Promise.all([
      Promise.all(order.items.map((line) => this.item(line, authorization))),
      this.paymentStatus(order.paymentId, authorization),
    ]);
    return { orderId: order.id, status: order.status, total: order.total, paymentStatus, items };
  }

  async close(): Promise<void> {
    await Promise.all([this.order.close(), this.catalog.close(), this.payment.close()]);
  }

  private async item(line: OrderLine, authorization: string | undefined): Promise<ScreenItem> {
    const card = await this.catalog.getJson<ProductCard>(`/api/v1/products/${line.productId}`, authorization);
    return { productId: line.productId, title: card.title, quantity: line.quantity, price: card.price };
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
