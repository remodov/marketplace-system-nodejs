import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { Request, Response } from 'express';
import { InvalidTransitionError } from '../payment/payment';
import { PaymentNotFoundError } from '../payment/payment.repository';

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  errors?: Record<string, string>;
};

const statusTitles: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export class ProblemError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ProblemError';
  }
}

export const validationError = (detail: string, errors?: Record<string, string>): ProblemError => new ProblemError(400, 'VALIDATION_ERROR', detail, errors);
export const notReady = (): ProblemError => new ProblemError(503, 'NOT_READY', 'База недоступна');

export function problemOf(status: number, code: string, detail: string, instance: string, errors?: Record<string, string>): Problem {
  return {
    type: `urn:problem:payment:${code}`,
    title: statusTitles[status] ?? 'Error',
    status,
    detail,
    instance,
    code,
    ...(errors ? { errors } : {}),
  };
}

type BodyParserFailure = Error & { type?: string };

function isMalformedRequest(error: unknown): boolean {
  if (error instanceof BadRequestException) return true;
  return error instanceof Error && (error as BodyParserFailure).type === 'entity.parse.failed';
}

function codeOf(error: HttpException): string {
  return (statusTitles[error.getStatus()] ?? 'HTTP_ERROR').replace(/\s+/g, '_').toUpperCase();
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly log = new Logger('http');

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const problem = this.toProblem(error, request.path);
    if (problem.status >= 500) {
      this.log.error(`необработанная ошибка на ${request.method} ${request.path}`, error instanceof Error ? error.stack : String(error));
    }
    response.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(error: unknown, instance: string): Problem {
    if (error instanceof ProblemError) return problemOf(error.status, error.code, error.message, instance, error.errors);
    if (error instanceof PaymentNotFoundError) return problemOf(404, 'PAYMENT_NOT_FOUND', 'Платёж не найден', instance);
    if (error instanceof InvalidTransitionError) return problemOf(409, 'INVALID_PAYMENT_TRANSITION', error.message, instance);
    if (isMalformedRequest(error)) return problemOf(400, 'MALFORMED_REQUEST', 'Невозможно разобрать тело запроса', instance);
    if (error instanceof HttpException) return problemOf(error.getStatus(), codeOf(error), error.message, instance);
    return problemOf(500, 'INTERNAL_SERVER_ERROR', 'Внутренняя ошибка сервиса', instance);
  }
}

export function fieldErrorsOf(errors: ValidationError[]): ProblemError {
  const fields: Record<string, string> = {};
  for (const e of errors) {
    const messages = Object.values(e.constraints ?? {});
    if (messages.length > 0) fields[e.property] = messages[0];
  }
  return validationError('Нужны orderId, сумма больше нуля и валюта из трёх букв', fields);
}

export function validationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    stopAtFirstError: true,
    exceptionFactory: (errors) => fieldErrorsOf(errors),
  });
}
