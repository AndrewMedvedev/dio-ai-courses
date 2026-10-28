export interface AiModel {
  uid: string;
  name: string;
  description?: string;
  context?: string;
  [key: string]: unknown;
}

export interface AiModelPayload {
  name?: string;
  description?: string;
  context?: string;
}

export interface AiModelsPage {
  page: number;
  size: number;
  total_items: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  items: AiModel[];
}
