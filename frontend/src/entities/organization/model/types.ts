export interface Organization {
  id: string;
  name: string;
  email?: string;
  description?: string;
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
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  items: Organization[];
}
