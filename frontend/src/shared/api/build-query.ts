import { toText } from '@/shared/lib/text';
/** Собирает query-строку, пропуская пустые значения. */
export function buildQuery(params: Record<string, unknown> = {}): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, toText(value));
    }
  });
  return query.toString();
}
