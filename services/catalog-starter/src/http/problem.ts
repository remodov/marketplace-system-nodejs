import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConflictError, InvalidError, NotFoundError, OutOfStockError } from '../product/product.errors';

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string>;
};

export class FieldErrors extends Error {
  constructor(readonly fields: Record<string, string>) {
    super('Запрос не прошёл проверку');
  }
}

export class BadInputError extends Error {}

const statusTitles: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
};

export function problemOf(status: number, detail: string, instance: string, errors?: Record<string, string>): Problem {
  return {
    type: 'about:blank',
    title: statusTitles[status] ?? HttpStatus[status] ?? 'Error',
    status,
    detail,
    instance,
    ...(errors ? { errors } : {}),
  };
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
    if (error instanceof FieldErrors) return problemOf(400, error.message, instance, error.fields);
    if (error instanceof BadInputError) return problemOf(400, error.message, instance);
    if (error instanceof NotFoundError) return problemOf(404, error.message, instance);
    if (error instanceof OutOfStockError) return problemOf(409, error.message, instance);
    if (error instanceof ConflictError) return problemOf(409, error.message, instance);
    if (error instanceof InvalidError) return problemOf(400, error.message, instance);
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const detail = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? error.message);
      return problemOf(error.getStatus(), Array.isArray(detail) ? detail.join('; ') : detail, instance);
    }
    return problemOf(500, 'Внутренняя ошибка сервиса', instance);
  }
}

export function fieldErrorsOf(errors: ValidationError[]): FieldErrors {
  const fields: Record<string, string> = {};
  for (const e of errors) {
    const messages = Object.values(e.constraints ?? {});
    fields[e.property] = messages[0] ?? 'недопустимое значение';
  }
  return new FieldErrors(fields);
}

export function validationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    stopAtFirstError: true,
    exceptionFactory: (errors) => fieldErrorsOf(errors),
  });
}

export function badRequest(detail: string): BadRequestException {
  return new BadRequestException(detail);
}
