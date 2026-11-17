import { toText } from '@/shared/lib/text';
import { asRecords } from '@/shared/api';
import {
  readStoredSession,
  requestJson,
  type PageParams,
  type RawApiRecord,
} from '@/shared/api';
import type { AiModel, AiModelPayload, AiModelsPage } from '../model/types';

const modelSearchRequests = new Map<string, Promise<AiModelsPage>>();

function normalizeModelsPage(
  response: RawApiRecord | null | undefined,
): AiModelsPage {
  const totalItems = Number(response?.total_items ?? response?.total ?? 0);
  const size = Number(response?.size) || 10;

  return {
    page: Number(response?.page || 1),
    size,
    total_items: Number(totalItems),
    total: Number(totalItems),
    total_pages: Number(
      response?.total_pages ??
        response?.pages ??
        Math.max(1, Math.ceil(totalItems / size)),
    ),
    has_next: Boolean(response?.has_next),
    has_prev: Boolean(response?.has_prev),
    items: asRecords(response?.items).map((item) => ({
      ...item,
      uid: toText(item.uid || item.id),
      name: toText(item.name),
    })),
  };
}

function sanitizeModelPayload(data: AiModelPayload = {}) {
  return {
    name: typeof data.name === 'string' ? data.name.trim() : '',
    description: data.description || '',
    context: data.context || '',
  };
}

export async function fetchModelsPage(
  params: PageParams = {},
): Promise<AiModelsPage> {
  const session = readStoredSession();
  const key = JSON.stringify([
    session.accessToken,
    session.membershipId,
    params.page || 1,
    params.size || 10,
  ]);
  const pending = modelSearchRequests.get(key);
  if (pending) return pending;
  const request = requestJson('/ai-models/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: params.page || 1,
      size: params.size || 10,
    }),
  })
    .then(normalizeModelsPage)
    .finally(() => {
      if (modelSearchRequests.get(key) === request)
        modelSearchRequests.delete(key);
    });
  modelSearchRequests.set(key, request);
  return request;
}

export async function createModel(data: AiModelPayload): Promise<AiModel> {
  return requestJson('/ai/models/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitizeModelPayload(data)),
  });
}

export async function deleteModel(modelUid: string): Promise<unknown> {
  return requestJson(`/ai/models/${encodeURIComponent(modelUid)}`, {
    method: 'DELETE',
  });
}

// ───── приглашения на курс ─────
