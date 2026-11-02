import { getLocalStorage } from "@/shared/lib/storage";

const SESSION_KEY = "aicolab_session";
const REFRESH_SKEW_SECONDS = 30;

export interface StoredSession {
  accessToken: string | null;
  refreshToken: string | null;
  /** Unix-время истечения access-токена, в секундах. */
  expiresAt: number | null;
  membershipId: string | null;
  organizationId: string | null;
}

export interface SessionTokens {
  access: string | null;
  refresh: string | null;
  expiresAt: number | null;
}

type TokenChangeHandler = (session: StoredSession) => void;

let tokenChangeHandler: TokenChangeHandler | null = null;
const tokenEventTarget =
  typeof EventTarget !== "undefined" ? new EventTarget() : null;

export function emptySession(): StoredSession {
  return {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    membershipId: null,
    organizationId: null,
  };
}

export function readStoredSession(): StoredSession {
  const storage = getLocalStorage();
  if (!storage) {
    return emptySession();
  }

  try {
    const value = JSON.parse(
      storage.getItem(SESSION_KEY) || "null",
    ) as Partial<StoredSession> | null;
    return {
      accessToken: value?.accessToken || null,
      refreshToken: value?.refreshToken || null,
      expiresAt: Number(value?.expiresAt) || null,
      membershipId: value?.membershipId || null,
      organizationId: value?.organizationId || null,
    };
  } catch {
    return emptySession();
  }
}

export function saveStoredSession(
  session: Partial<StoredSession> | null,
): void {
  const storage = getLocalStorage();
  if (!storage) return;

  if (!session) {
    storage.removeItem(SESSION_KEY);
    storage.removeItem("user");
    emitTokenChange(emptySession());
    return;
  }

  // Компромисс: backend возвращает bearer-токены в тело ответа, httpOnly cookie
  // здесь недоступны без изменения контракта API. Храним в localStorage для
  // восстановления сессии после перезагрузки; TODO: заменить на httpOnly cookies
  // или in-memory access token + refresh cookie, когда backend поддержит это.
  const nextSession: StoredSession = {
    accessToken: session.accessToken || null,
    refreshToken: session.refreshToken || null,
    expiresAt: Number(session.expiresAt) || null,
    membershipId: session.membershipId || null,
    organizationId: session.organizationId || null,
  };
  storage.setItem(SESSION_KEY, JSON.stringify(nextSession));
  emitTokenChange(nextSession);
}

export function clearTokens(): void {
  saveStoredSession(null);
}

export function getTokens(): SessionTokens {
  const session = readStoredSession();
  return {
    access: session.accessToken,
    refresh: session.refreshToken,
    expiresAt: session.expiresAt,
  };
}

function emitTokenChange(session: StoredSession): void {
  if (typeof tokenChangeHandler === "function") {
    tokenChangeHandler(session);
  }
  tokenEventTarget?.dispatchEvent(new Event("tokenRefreshed"));
}

export function setTokenChangeHandler(
  handler: TokenChangeHandler | null,
): void {
  tokenChangeHandler = handler;
}

export function onTokenRefreshed(callback: () => void): () => void {
  if (!tokenEventTarget || typeof callback !== "function") {
    return () => {};
  }
  tokenEventTarget.addEventListener("tokenRefreshed", callback);
  return () => tokenEventTarget.removeEventListener("tokenRefreshed", callback);
}

export function shouldRefresh(expiresAt: number | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt <= Math.floor(Date.now() / 1000) + REFRESH_SKEW_SECONDS;
}

export function isTokenExpired(
  expiresAt: number | string | null | undefined = readStoredSession().expiresAt,
): boolean {
  return !expiresAt || shouldRefresh(Number(expiresAt));
}

export const tokenStorage = {
  getAccessToken: () => readStoredSession().accessToken,
  getRefreshToken: () => readStoredSession().refreshToken,
  setTokens: (
    accessToken: string | null,
    refreshToken: string | null,
    expiresAt: number | null,
  ) => {
    const current = readStoredSession();
    saveStoredSession({
      ...current,
      accessToken,
      refreshToken,
      expiresAt,
    });
  },
  clearTokens: () => saveStoredSession(null),
  isTokenExpired,
};

function decodeJwtExp(token: unknown): number | null {
  if (!token || typeof token !== "string") return null;

  try {
    const encodedPayload = token.split(".")[1] || "";
    const base64Payload = encodedPayload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=");
    const payload = JSON.parse(atob(base64Payload)) as { exp?: unknown } | null;
    return Number(payload?.exp) || null;
  } catch {
    return null;
  }
}

function normalizeExpiresAt(
  value: unknown,
  accessToken: string | null,
): number | null {
  if (value === null || value === undefined || value === "") {
    return decodeJwtExp(accessToken);
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue > 9999999999
      ? Math.floor(numericValue / 1000)
      : numericValue;
  }

  const parsedDate = Date.parse(String(value));
  if (Number.isFinite(parsedDate)) {
    return Math.floor(parsedDate / 1000);
  }

  return decodeJwtExp(accessToken);
}

interface RawTokens {
  access_token?: string;
  accessToken?: string;
  access?: string;
  refresh_token?: string;
  refreshToken?: string;
  refresh?: string;
  expires_at?: unknown;
  expiresAt?: unknown;
  exp?: unknown;
  access_expires_at?: unknown;
  accessTokenExpiresAt?: unknown;
}

export type TokenResponse = RawTokens & {
  tokens?: RawTokens;
  data?: RawTokens;
};

/** Достаёт токены из ответа бэкенда в любом из встречающихся форматов. */
export function normalizeTokenResponse(data: TokenResponse | null | undefined) {
  const source: RawTokens = data?.tokens || data?.data || data || {};
  const accessToken =
    source.access_token || source.accessToken || source.access || null;
  const refreshToken =
    source.refresh_token || source.refreshToken || source.refresh || null;
  const rawExpiresAt =
    source.expires_at ||
    source.expiresAt ||
    source.exp ||
    source.access_expires_at ||
    source.accessTokenExpiresAt;

  return {
    accessToken,
    refreshToken,
    expiresAt: normalizeExpiresAt(rawExpiresAt, accessToken),
  };
}

export function saveTokensFromResponse(
  data: TokenResponse | null | undefined,
): StoredSession {
  const current = readStoredSession();
  const tokens = normalizeTokenResponse(data);
  const nextSession: StoredSession = {
    ...current,
    accessToken: tokens.accessToken || current.accessToken,
    refreshToken: tokens.refreshToken || current.refreshToken,
    expiresAt: tokens.expiresAt || current.expiresAt,
  };
  saveStoredSession(nextSession);
  return nextSession;
}
