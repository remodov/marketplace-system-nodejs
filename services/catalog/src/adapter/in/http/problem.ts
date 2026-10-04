import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError, ErrorKind, validationError } from '../../../core/apperr';
import { NotReadyError } from './health.controller';

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
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  503: 'Service Unavailable',
};

const statusOfKind: Record<ErrorKind, number> = {
  invalid: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
};

export function problemOf(status: number, code: string, detail: string, instance: string, errors?: Record<string, string>): Problem {
  return {
    type: `urn:problem:catalog:${code}`,
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

function codeOfHttpException(error: HttpException): string {
  const body = error.getResponse();
  const title = typeof body === 'object' && body !== null ? (body as { error?: string }).error : undefined;
  return (title ?? statusTitles[error.getStatus()] ?? 'HTTP_ERROR').replace(/\s+/g, '_').toUpperCase();
}

function detailOfHttpException(error: HttpException): string {
  const body = error.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: string | string[] }).message ?? error.message;
  return Array.isArray(message) ? message.join('; ') : message;
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
    if (problem.status === 401) response.setHeader('WWW-Authenticate', problem.code === 'TOKEN_MISSING' ? 'Bearer' : 'Bearer error="invalid_token"');
    response.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(error: unknown, instance: string): Problem {
    if (error instanceof AppError) return problemOf(statusOfKind[error.kind], error.code, error.message, instance, error.fields);
    if (isMalformedRequest(error)) return problemOf(400, 'MALFORMED_REQUEST', 'Невозможно разобрать тело запроса', instance);
    if (error instanceof NotReadyError) return problemOf(503, 'NOT_READY', error.message, instance);
    if (error instanceof HttpException) return problemOf(error.getStatus(), codeOfHttpException(error), detailOfHttpException(error), instance);
    return problemOf(500, 'INTERNAL_SERVER_ERROR', 'Внутренняя ошибка сервиса', instance);
  }
}

export function fieldErrorsOf(errors: ValidationError[]): AppError {
  const fields: Record<string, string> = {};
  for (const e of errors) {
    const messages = Object.values(e.constraints ?? {});
    fields[e.property] = messages[0] ?? 'недопустимое значение';
  }
  return validationError(fields);
}

export function validationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    stopAtFirstError: true,
    exceptionFactory: (errors) => fieldErrorsOf(errors),
  });
}
