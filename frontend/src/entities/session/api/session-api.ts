import { requestJson, type TokenResponse } from "@/shared/api";
import type {
  Identity,
  LoginCredentials,
  LoginResponse,
  SessionUser,
} from "../model/types";

export async function login(
  credentialsOrEmail: LoginCredentials | string,
  maybePassword?: string,
): Promise<LoginResponse> {
  const credentials =
    typeof credentialsOrEmail === "object"
      ? credentialsOrEmail
      : { email: credentialsOrEmail, password: maybePassword };

  return requestJson<LoginResponse>(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    },
    { auth: false },
  );
}

export async function authenticateWithMembership(body: {
  authentication_token: string;
  membership_id: string;
}): Promise<TokenResponse> {
  return requestJson<TokenResponse>(
    "/auth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { auth: false },
  );
}

export async function logout(tokens: {
  access_token: string;
  refresh_token: string;
}): Promise<unknown> {
  return requestJson(
    "/auth/logout",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens),
    },
    { auth: false, retry: false },
  );
}

export async function fetchIdentity(): Promise<Identity> {
  return requestJson<Identity>("/auth/identity");
}

export async function fetchCurrentUser(): Promise<SessionUser> {
  return requestJson<SessionUser>(
    "/users/me",
    {},
    { clearOnUnauthorized: false },
  );
}

export async function updateCurrentUser(
  changes: Record<string, unknown>,
): Promise<SessionUser> {
  return requestJson<SessionUser>("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
}
