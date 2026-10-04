import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

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
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export class ProblemError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProblemError';
  }
}

export const accessDenied = (): ProblemError => new ProblemError(403, 'ACCESS_DENIED', 'Доступ запрещён');
export const validationError = (detail: string): ProblemError => new ProblemError(400, 'VALIDATION_ERROR', detail);
export const notReady = (): ProblemError => new ProblemError(503, 'NOT_READY', 'База недоступна');

export function problemOf(status: number, code: string, detail: string, instance: string): Problem {
  return { type: `urn:problem:notification:${code}`, title: statusTitles[status] ?? 'Error', status, detail, instance, code };
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
    if (error instanceof ProblemError) return problemOf(error.status, error.code, error.message, instance);
    if (error instanceof HttpException) return problemOf(error.getStatus(), codeOf(error), error.message, instance);
    return problemOf(500, 'INTERNAL_SERVER_ERROR', 'Внутренняя ошибка сервиса', instance);
  }
}
