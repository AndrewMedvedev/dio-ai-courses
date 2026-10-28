/** Убирает из объекта поля со значением undefined и null. */
export function withoutEmptyValues<T extends Record<string, unknown>>(
  payload: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  ) as Partial<T>;
}
