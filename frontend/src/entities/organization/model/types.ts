export interface Organization {
  id: string;
  name: string;
  email?: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OrganizationPayload {
  name?: string;
  email?: string;
  description?: string;
}

export interface OrganizationsPage {
  page: number;
  size: number;
  total_items: number;
  /** Старое поле количества: на случай ответа без total_items. */
  total?: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  items: Organization[];
}
