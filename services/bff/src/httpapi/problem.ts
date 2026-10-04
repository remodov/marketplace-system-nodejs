import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { DownstreamError } from '../screen/downstream.client';
import { ORDER } from '../screen/screen.assembler';

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
};

const statusTitles: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
};

export class ProblemError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ProblemError';
  }
}

export const validationError = (detail: string): ProblemError => new ProblemError(400, 'VALIDATION_ERROR', detail);
export const rateLimited = (retryAfterSeconds: number): ProblemError =>
  new ProblemError(429, 'RATE_LIMITED', 'Слишком много запросов, попробуйте позже', { 'Retry-After': String(retryAfterSeconds) });

export function problemOf(status: number, code: string, detail: string, instance: string): Problem {
  return {
    type: `urn:problem:bff:${code}`,
    title: statusTitles[status] ?? 'Error',
    status,
    detail,
    instance,
    code,
  };
}

export function downstreamProblem(error: DownstreamError, instance: string): Problem {
  if (error.service === ORDER && error.status === 404) return problemOf(404, 'ORDER_NOT_FOUND', 'Заказ не найден', instance);
  if (error.service === ORDER && (error.status === 401 || error.status === 403)) {
    return problemOf(error.status, 'ORDER_ACCESS_DENIED', 'Заказ недоступен этому пользователю', instance);
  }
  return problemOf(502, 'DOWNSTREAM_UNAVAILABLE', 'Сервис-источник не ответил, экран собрать не удалось', instance);
}

function codeOf(error: HttpException): string {
  return (statusTitles[error.getStatus()] ?? 'HTTP_ERROR').replace(/\s+/g, '_').toUpperCase();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly log = new Logger('http');

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const problem = this.toProblem(error, request.path);
    this.report(problem, error, request);
    if (error instanceof ProblemError) {
      for (const [name, value] of Object.entries(error.headers)) response.setHeader(name, value);
    }
    response.status(problem.status).type('application/problem+json').send(problem);
  }

  private report(problem: Problem, error: unknown, request: Request): void {
    if (problem.status === 502) {
      this.log.warn(`экран не собран на ${request.method} ${request.path}: ${messageOf(error)}`);
      return;
    }
    if (problem.status >= 500) {
      this.log.error(`необработанная ошибка на ${request.method} ${request.path}`, error instanceof Error ? error.stack : String(error));
    }
  }

  private toProblem(error: unknown, instance: string): Problem {
    if (error instanceof ProblemError) return problemOf(error.status, error.code, error.message, instance);
    if (error instanceof DownstreamError) return downstreamProblem(error, instance);
    if (error instanceof HttpException) return problemOf(error.getStatus(), codeOf(error), error.message, instance);
    return problemOf(500, 'INTERNAL_SERVER_ERROR', 'Внутренняя ошибка сервиса', instance);
  }
}
