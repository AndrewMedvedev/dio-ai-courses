import { requestJson, type PageParams, type RawApiRecord } from "@/shared/api";
import type { AiModel, AiModelPayload, AiModelsPage } from "../model/types";

function normalizeModelsPage(
  response: RawApiRecord | null | undefined,
): AiModelsPage {
  const totalItems = response?.total_items ?? response?.total ?? 0;
  const size = response?.size || 10;

  return {
    page: response?.page || 1,
    size,
    total_items: totalItems,
    total: totalItems,
    total_pages:
      response?.total_pages ??
      response?.pages ??
      Math.max(1, Math.ceil(totalItems / size)),
    has_next: Boolean(response?.has_next),
    has_prev: Boolean(response?.has_prev),
    items: Array.isArray(response?.items) ? response.items : [],
  };
}

function sanitizeModelPayload(data: AiModelPayload = {}) {
  return {
    name: typeof data.name === "string" ? data.name.trim() : "",
    description: data.description || "",
    context: data.context || "",
  };
}

export async function fetchModelsPage(
  params: PageParams = {},
): Promise<AiModelsPage> {
  const response = await requestJson("/ai/models/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page: params.page || 1,
      size: params.size || 10,
    }),
  });
  return normalizeModelsPage(response);
}

export async function createModel(data: AiModelPayload): Promise<AiModel> {
  return requestJson("/ai/models/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sanitizeModelPayload(data)),
  });
}

export async function deleteModel(modelUid: string): Promise<unknown> {
  return requestJson(`/ai/models/${encodeURIComponent(modelUid)}`, {
    method: "DELETE",
  });
}

// ───── приглашения на курс ─────
