import crypto from 'crypto';
import { AppError } from '../types';

export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function requireUuid(id: string | undefined | null, fieldName = 'id'): string {
  if (!isValidUuid(id)) {
    throw new AppError(`Invalid UUID for ${fieldName}: ${id}`, 400, 'INVALID_UUID');
  }
  return id!;
}

export function parseUuidOrNull(id?: string | null): string | null {
  return isValidUuid(id) ? id! : null;
}

export function newUuid(): string {
  return crypto.randomUUID();
}

export function toValidUuid(input?: string | null): string {
  if (!input || typeof input !== 'string') {
    return '00000000-0000-0000-0000-000000000001';
  }
  if (isValidUuid(input)) {
    return input;
  }
  const hex = crypto.createHash('md5').update(input).digest('hex');
  // Format as RFC-4122 compliant UUID (version 4, variant 8)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
