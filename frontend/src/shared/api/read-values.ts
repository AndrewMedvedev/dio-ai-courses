import type { RawApiRecord } from './types';

export function asRecord(value: unknown): RawApiRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawApiRecord)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

export function asRecords(value: unknown): RawApiRecord[] {
  return asArray(value).filter(
    (item): item is RawApiRecord =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );
}
