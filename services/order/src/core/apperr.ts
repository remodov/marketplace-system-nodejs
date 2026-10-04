export type ErrorKind = 'invalid' | 'not_found' | 'forbidden' | 'conflict' | 'unauthorized' | 'unavailable';

export class AppError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AppError';
  }
}

export const invalid = (code: string, message: string): AppError => new AppError('invalid', code, message);
export const notFound = (code: string, message: string): AppError => new AppError('not_found', code, message);
export const forbidden = (code: string, message: string): AppError => new AppError('forbidden', code, message);
export const conflict = (code: string, message: string): AppError => new AppError('conflict', code, message);
export const unauthorized = (code: string, message: string): AppError => new AppError('unauthorized', code, message);
export const unavailable = (code: string, message: string, cause?: unknown): AppError =>
  new AppError('unavailable', code, message, undefined, cause);

export function kindOf(error: unknown): ErrorKind | undefined {
  return error instanceof AppError ? error.kind : undefined;
}

export function validationError(fields: Record<string, string>): AppError {
  return new AppError('invalid', 'VALIDATION_ERROR', 'Ошибка валидации входных данных', fields);
}
