/** Примитивы для интерфейса; объекты не превращаются в [object Object]. */
export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  return '';
}
