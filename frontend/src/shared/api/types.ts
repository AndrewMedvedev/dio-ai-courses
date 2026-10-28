/**
 * Ответ бэкенда, который приходит в нестабильном формате (snake_case и
 * camelCase, обёртки data / items). Его сужают мапперы в entities.
 */
// any: формат ответа нестабилен, сужаем в мапперах.
export type RawApiRecord = Record<string, any>;

export interface PageParams {
  page?: number;
  size?: number;
}

/** Страница списка в формате бэкенда. */
export interface Paginated<T> {
  items: T[];
  page?: number;
  size?: number;
  total?: number;
  total_items?: number;
  pages?: number;
  total_pages?: number;
  has_next?: boolean;
  has_prev?: boolean;
}

/** Страница списка, приведённая к виду интерфейса. */
export interface ItemsPage<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}
