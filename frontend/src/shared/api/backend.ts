import { createApiError } from "./api-error";
import {
  clearTokens,
  getTokens,
  isTokenExpired,
  saveTokensFromResponse,
  shouldRefresh,
} from "./session";

export const API_BASE = "/api/v1";

export interface RequestOptions {
  /** Подставлять Bearer-токен (по умолчанию да). */
  auth?: boolean;
  /** Повторить запрос после обновления токена при 401 (по умолчанию да). */
  retry?: boolean;
  /** Выходить из сессии при 401 (по умолчанию да). */
  clearOnUnauthorized?: boolean;
}

export type JsonRequestOptions = RequestInit &
  Pick<RequestOptions, "auth" | "retry">;

let refreshPromise: Promise<string | null> | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function isAuthenticated(): boolean {
  const { access, refresh, expiresAt } = getTokens();
  return Boolean(
    access && expiresAt && (!isTokenExpired(expiresAt) || refresh),
  );
}

export function redirectToLogin(): void {
  clearTokens();
  if (typeof unauthorizedHandler === "function") {
    unauthorizedHandler();
  }
}

function handleUnauthorized(): void {
  redirectToLogin();
}

async function postRefreshToken(body: unknown): Promise<Response> {
  return fetch(`${API_BASE}/auth/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function refreshAccessToken(): Promise<string | null> {
  const { refresh } = getTokens();
  if (!refresh) return null;

  if (!refreshPromise) {
    refreshPromise = postRefreshToken(refresh)
      .then(async (response) => {
        if (!response.ok && [400, 422].includes(response.status)) {
          response = await postRefreshToken({
            refresh_token: refresh,
          });
        }

        if (!response.ok) {
          throw await createApiError(response, "Сессия истекла.");
        }

        const data = await response.json();
        const session = saveTokensFromResponse(data);
        return session.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

/**
 * Низкоуровневый запрос к бэкенду: подставляет токен, обновляет его
 * перед истечением и повторяет запрос после 401. Возвращает Response как есть.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
  {
    auth = true,
    retry = true,
    clearOnUnauthorized = true,
  }: RequestOptions = {},
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  let { access, expiresAt } = getTokens();

  if (auth && !access) {
    if (clearOnUnauthorized) {
      handleUnauthorized();
    }
    return new Response(null, { status: 401 });
  }

  if (auth && access && shouldRefresh(expiresAt)) {
    try {
      access = await refreshAccessToken();
    } catch {
      handleUnauthorized();
      return new Response(null, { status: 401 });
    }
  }

  if (auth && access) {
    headers.Authorization = `Bearer ${access}`;
  }

  let response = await fetch(url, { ...options, headers });

  if (auth && retry && response.status === 401 && access) {
    try {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await fetch(url, {
          ...options,
          headers: { ...headers, Authorization: `Bearer ${newToken}` },
        });
      }
    } catch {
      handleUnauthorized();
      return response;
    }
  }

  if (auth && response.status === 401 && clearOnUnauthorized) {
    handleUnauthorized();
  }

  return response;
}

/**
 * Запрос к бэкенду с разбором ответа: JSON → объект, пустой ответ и 204 → null,
 * не-JSON → текст. При ошибке бросает ApiError с понятным сообщением.
 */
// any: ответы бэкенда типизируются в entities по мере переноса.
export async function requestJson<T = any>(
  path: string,
  options: RequestInit = {},
  {
    auth = true,
    retry = true,
    clearOnUnauthorized = true,
  }: RequestOptions = {},
): Promise<T> {
  const response = await apiFetch(path, options, {
    auth,
    retry,
    clearOnUnauthorized,
  });
  if (!response.ok) {
    throw await createApiError(
      response,
      `Ошибка запроса ${options.method || "GET"} ${path}`,
    );
  }
  if (response.status === 204) return null as T;

  const text = await response.text();
  if (!text.trim()) return null as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/** JSON-запрос: сериализует body и ставит Content-Type. */
// any: см. requestJson.
export async function jsonRequest<T = any>(
  path: string,
  method: string,
  body?: unknown,
  options: JsonRequestOptions = {},
): Promise<T> {
  const { auth, retry, ...fetchOptions } = options;
  return requestJson<T>(
    path,
    {
      ...fetchOptions,
      method,
      headers: {
        "Content-Type": "application/json",
        ...((fetchOptions.headers as Record<string, string> | undefined) || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    {
      auth: auth ?? true,
      retry: retry ?? true,
    },
  );
}
