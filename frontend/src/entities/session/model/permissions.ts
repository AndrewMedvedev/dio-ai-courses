import type { Identity } from "./types";

export const COURSE_PERMISSIONS = {
  READ: "course:read",
  COURSE_READ: "course:course_read",
  CREATE: "course:create",
  UPDATE: "course:update",
  DELETE: "course:delete",
} as const;

export const ORGANIZATION_PERMISSIONS = {
  CREATE: "organization:create",
  READ: "organization:read",
  ORGANIZATION_READ: "organization:organization_read",
  UPDATE: "organization:update",
  DELETE: "organization:delete",
} as const;

// Приглашения в организацию. Отдельного приглашения в систему в интерфейсе нет:
// новых пользователей бэкенд регистрирует через приглашение в организацию.
export const INVITATION_PERMISSIONS = {
  ORGANIZATION_INVITE: "organization-invitations:invite",
} as const;

export const AI_MODEL_PERMISSIONS = {
  CREATE: "ai_model:create",
  DELETE: "ai_model:delete",
} as const;

/** Право в виде строки ("course:read", "course.read") или объекта с бэкенда. */
export type PermissionInput =
  | string
  | {
      code?: string;
      name?: string;
      permission?: string;
      resource?: string;
      action?: string;
    }
  | null
  | undefined;

function normalizePermissionString(value: unknown): string {
  const permission = String(value || "")
    .trim()
    .toLowerCase();
  if (!permission) return "";

  const withoutScope = permission.split(":")[0];
  const [resource, action] = withoutScope.includes(".")
    ? withoutScope.split(".", 2)
    : permission.split(":", 2);

  if (!resource || !action) return permission.replace(".", ":");

  return `${resource}:${action}`;
}

export function normalizePermissionCode(permission: unknown): string {
  if (typeof permission === "string") {
    return normalizePermissionString(permission);
  }

  if (!permission || typeof permission !== "object") {
    return "";
  }

  const source = permission as Exclude<
    PermissionInput,
    string | null | undefined
  >;
  const rawCode = source.code || source.name || source.permission;
  if (typeof rawCode === "string" && rawCode.trim()) {
    return normalizePermissionString(rawCode);
  }

  if (source.resource && source.action) {
    return normalizePermissionString(`${source.resource}:${source.action}`);
  }

  return "";
}

export function extractPermissionsFromIdentity(
  identity: Identity | unknown[] | null | undefined,
): string[] {
  if (Array.isArray(identity)) {
    return identity.map(normalizePermissionCode).filter(Boolean);
  }

  if (!identity || typeof identity !== "object") {
    return [];
  }

  const source = identity as Identity & Record<string, unknown>;
  const directPermissions =
    source.permissions ||
    source.effective_permissions ||
    source.effectivePermissions ||
    source.user_permissions ||
    source.userPermissions ||
    source.grants ||
    [];

  const membershipPermissions =
    source.membership?.permissions ||
    source.current_membership?.permissions ||
    source.currentMembership?.permissions ||
    [];

  const rolePermissions = Array.isArray(source.roles)
    ? source.roles.flatMap(
        (role) =>
          (role as { permissions?: unknown[] } | null)?.permissions || [],
      )
    : [];

  return [directPermissions, membershipPermissions, rolePermissions]
    .flat()
    .map(normalizePermissionCode)
    .filter(Boolean);
}
