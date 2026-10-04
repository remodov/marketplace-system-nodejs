import { createHash } from 'node:crypto';
import { validationError } from '../../../core/apperr';

export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export function idempotencyKeyOf(header: string | undefined): string {
  const key = (header ?? '').trim();
  if (key === '' || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw validationError({ 'Idempotency-Key': `обязательный заголовок до ${MAX_IDEMPOTENCY_KEY_LENGTH} символов` });
  }
  return key;
}

export function requestHashOf(body: unknown): string {
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, nested: unknown) => (isRecord(nested) ? withSortedKeys(nested) : nested));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withSortedKeys(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
