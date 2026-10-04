import { IsDefined, IsNumber, IsPositive, IsString, IsUUID, Length } from 'class-validator';
import { Payment, Status } from './payment';

export class AuthorizeRequest {
  @IsDefined({ message: 'обязательное поле' })
  @IsUUID('all', { message: 'должен быть UUID' })
  orderId!: string;

  @IsDefined({ message: 'обязательное поле' })
  @IsNumber({}, { message: 'должна быть числом' })
  @IsPositive({ message: 'должна быть больше нуля' })
  amount!: number;

  @IsDefined({ message: 'обязательное поле' })
  @IsString({ message: 'должна быть строкой' })
  @Length(3, 3, { message: 'три буквы кода валюты' })
  currency!: string;
}

export type PaymentView = {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: Status;
  updatedAt: string;
};

export function toView(payment: Payment): PaymentView {
  return {
    id: payment.id,
    orderId: payment.orderId,
    amount: payment.amount.toNumber(),
    currency: payment.currency,
    status: payment.status,
    updatedAt: payment.updatedAt.toISOString(),
  };
}
