import {
  apiFetch,
  requestJson,
  type ApiError,
  type RawApiRecord,
} from "@/shared/api";
import type { User, UserProfile } from "../model/types";

// Точечный поиск по уникальному email (индекс в БД): null, если такого пользователя нет.
export async function findUserByEmail(
  email: string,
  options: RequestInit = {},
): Promise<User | null> {
  try {
    return await requestJson(
      `/users/by-email/${encodeURIComponent(email)}`,
      options,
    );
  } catch (error) {
    if ((error as ApiError | null)?.status === 404) return null;
    throw error;
  }
}

export async function fetchUserById(userId: string): Promise<User> {
  return requestJson(`/users/${encodeURIComponent(userId)}`);
}

async function parseError(
  response: Response,
  fallbackMessage: string,
): Promise<
  Error & { status?: number; payload?: unknown; userMessage?: string }
> {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  const detail = payload?.detail || payload?.error?.message || payload;
  const message =
    typeof detail === "string" && detail.trim() ? detail : fallbackMessage;
  const error: Error & {
    status?: number;
    payload?: unknown;
    userMessage?: string;
  } = new Error(message);
  error.status = response.status;
  error.payload = payload;
  error.userMessage = message;
  return error;
}

function normalizeUser(raw: RawApiRecord = {}): UserProfile {
  return {
    id: raw.id || raw.user_id || raw.userId || "",
    fullName: raw.fullName || raw.full_name || "",
    avatarUrl: raw.avatarUrl || raw.avatar_url || "",
    email: raw.email || "",
    username: raw.username || "",
    isActive: raw.isActive ?? raw.is_active ?? true,
    createdAt: raw.createdAt || raw.created_at || "",
    updatedAt: raw.updatedAt || raw.updated_at || "",
  };
}

/** Профиль пользователя в формате интерфейса (camelCase). */
export async function getUserById(
  userId: string,
  options: RequestInit = {},
): Promise<UserProfile> {
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}`, {
    ...options,
    method: "GET",
  });

  if (!response.ok) {
    throw await parseError(
      response,
      "Не удалось загрузить данные пользователя.",
    );
  }

  return normalizeUser(await response.json());
}
