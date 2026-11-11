// Сессии чтения теории урока: активное время и глубина прокрутки (backend: /theory-sessions).
import {
  API_BASE,
  apiFetch,
  readStoredSession,
  type RawApiRecord,
} from "@/shared/api";

export interface TheorySession {
  id: string;
  lessonId: string;
  userId: string;
  completedAt: string | null;
  activeTimeSeconds: number;
  maxScrollDepthPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface TheorySessionMetrics {
  completed_at: string;
  active_time_seconds: number;
  max_scroll_depth_percent: number;
}

export interface TheorySessionsFilters {
  createdFrom?: string;
  createdTo?: string;
  sort?: string;
}

type TheorySessionError = Error & {
  status?: number;
  payload?: unknown;
  userMessage?: string;
};

async function parseError(
  response: Response,
  fallbackMessage: string,
): Promise<TheorySessionError> {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  const detail = payload?.detail || payload?.error?.message || payload;
  const message =
    typeof detail === "string" && detail.trim() ? detail : fallbackMessage;
  const error: TheorySessionError = new Error(message);
  error.status = response.status;
  error.payload = payload;
  error.userMessage = message;
  return error;
}

export async function createSession(
  lessonId: string,
  options: RequestInit = {},
): Promise<RawApiRecord> {
  const response = await apiFetch(
    `/theory-sessions/${encodeURIComponent(lessonId)}`,
    {
      ...options,
      method: "POST",
    },
    { clearOnUnauthorized: false },
  );

  if (!response.ok) {
    throw await parseError(response, "Не удалось создать сессию теории.");
  }

  return response.json();
}

export async function updateSession(
  sessionId: string,
  metrics: TheorySessionMetrics,
  options: RequestInit = {},
): Promise<RawApiRecord> {
  const response = await apiFetch(
    `/theory-sessions/${encodeURIComponent(sessionId)}`,
    {
      ...options,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...((options.headers as Record<string, string> | undefined) || {}),
      },
      body: JSON.stringify(metrics),
    },
    { clearOnUnauthorized: false },
  );

  if (!response.ok) {
    throw await parseError(response, "Не удалось сохранить метрики теории.");
  }

  return response.json();
}

function normalizeTheorySession(raw: RawApiRecord = {}): TheorySession {
  return {
    id: raw.id || "",
    lessonId: raw.lesson_id || raw.lessonId || "",
    userId: raw.user_id || raw.userId || "",
    completedAt: raw.completed_at ?? raw.completedAt ?? null,
    activeTimeSeconds:
      Number(raw.active_time_seconds ?? raw.activeTimeSeconds ?? 0) || 0,
    maxScrollDepthPercent:
      Number(raw.max_scroll_depth_percent ?? raw.maxScrollDepthPercent ?? 0) ||
      0,
    createdAt: raw.created_at || raw.createdAt || "",
    updatedAt: raw.updated_at || raw.updatedAt || "",
  };
}

function buildSessionsQuery(filters: TheorySessionsFilters = {}): string {
  const query = new URLSearchParams();
  if (filters.createdFrom) query.append("created_from", filters.createdFrom);
  if (filters.createdTo) query.append("created_to", filters.createdTo);
  if (filters.sort) query.append("sort", filters.sort);
  return query.toString();
}

export async function getTheorySessions(
  lessonId: string,
  userId: string,
  filters: TheorySessionsFilters = {},
  options: RequestInit = {},
): Promise<TheorySession[]> {
  if (!lessonId || !userId) {
    throw new Error("Для загрузки метрик нужно выбрать урок и студента.");
  }

  const query = buildSessionsQuery(filters);
  const response = await apiFetch(
    `/theory-sessions/${encodeURIComponent(lessonId)}/users/${encodeURIComponent(userId)}${query ? `?${query}` : ""}`,
    {
      ...options,
      method: "GET",
    },
    { clearOnUnauthorized: false },
  );

  if (!response.ok) {
    throw await parseError(response, "Не удалось загрузить метрики теории.");
  }

  const data = await response.json();
  return Array.isArray(data) ? data.map(normalizeTheorySession) : [];
}

/** Отправка метрик при закрытии страницы (fetch с keepalive). */
export function updateSessionKeepalive(
  sessionId: string,
  metrics: TheorySessionMetrics,
): boolean {
  const accessToken = readStoredSession().accessToken;

  if (!accessToken || !sessionId) {
    return false;
  }

  fetch(`${API_BASE}/theory-sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(metrics),
  }).catch(() => {});

  return true;
}
