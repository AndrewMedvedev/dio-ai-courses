import {
  jsonRequest,
  requestJson,
  type ItemsPage,
  type PageParams,
  type Paginated,
  type RawApiRecord,
  type TokenResponse,
} from "@/shared/api";
import type {
  AcceptInvitationParams,
  InvitationPreview,
  InvitationSource,
  OrganizationInvitation,
  Role,
} from "../model/types";

/** Регистрация нового пользователя по приглашению: вернёт токены сессии. */
export async function acceptInvitation({
  token,
  password,
  full_name,
  username,
}: AcceptInvitationParams): Promise<TokenResponse> {
  return requestJson(
    `/invitations/accept/${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, full_name, username }),
    },
    { auth: false },
  );
}

export function previewInvitation(token: string): Promise<InvitationPreview> {
  return requestJson(
    `/invitations/preview/${encodeURIComponent(token)}`,
    {},
    { auth: false },
  );
}

export async function fetchInvitationRoles(): Promise<Role[]> {
  const roles: Role[] = [];
  let page = 1;
  let result: Paginated<Role>;
  do {
    result = await requestJson(`/roles?page=${page}&size=100`);
    roles.push(...result.items);
    page += 1;
  } while (result.has_next);
  // Preserve the supported invitation roles, resolving their actual database IDs.
  return roles.filter((role) => ["default_role", "admin"].includes(role.code));
}

// Приглашение в текущую организацию (бэкенд берёт её из токена); роли — массив UUID.
export async function inviteToOrganization({
  email,
  grantedRoles = [],
}: {
  email: string;
  grantedRoles?: string[];
}): Promise<unknown> {
  return jsonRequest("/organizations/invitations", "POST", {
    email,
    grantedRoles,
  });
}

export function fetchOrganizationInvitations(
  page = 1,
): Promise<Paginated<OrganizationInvitation>> {
  return requestJson(`/organizations/invitations?page=${page}&size=20`);
}

export function revokeOrganizationInvitation(
  id: string,
  source: InvitationSource,
): Promise<unknown> {
  return requestJson(
    `/organizations/invitations/revoke/${encodeURIComponent(id)}?source=${encodeURIComponent(source)}`,
    { method: "DELETE" },
  );
}

export function resendOrganizationInvitation(
  id: string,
  source: InvitationSource,
): Promise<OrganizationInvitation> {
  return requestJson(
    `/organizations/invitations/${encodeURIComponent(id)}/resend?source=${encodeURIComponent(source)}`,
    { method: "POST" },
  );
}

// Принятие приглашения в организацию уже существующим пользователем.
export async function acceptOrganizationInvitation(
  token: string,
): Promise<RawApiRecord | null> {
  return requestJson(
    `/organizations/invitations/accept/${encodeURIComponent(token)}`,
    { method: "POST" },
  );
}

export async function inviteToCourse({
  courseId,
  email,
  role,
}: {
  courseId: string;
  email: string;
  role: string;
}): Promise<unknown> {
  return jsonRequest("/courses/invitations", "POST", {
    course_id: courseId,
    email,
    role,
  });
}

// Приглашения курса, которые ещё ждут ответа (без токенов из писем).
export async function fetchCourseInvitationsPage(
  courseId: string,
  { page = 1, size = 20 }: PageParams = {},
): Promise<ItemsPage<RawApiRecord>> {
  const query = new URLSearchParams({
    course_id: courseId,
    page: String(page),
    size: String(size),
  });
  const data = await requestJson(`/courses/invitations?${query.toString()}`);
  const items = Array.isArray(data) ? data : data?.items || [];
  return {
    items,
    page: Number(data?.page) || page,
    size: Number(data?.size) || size,
    total: Number(data?.total) || items.length,
    hasNext: Boolean(data?.has_next ?? data?.hasNext),
  };
}

export async function revokeCourseInvitation(
  invitationId: string,
): Promise<unknown> {
  return requestJson(
    `/courses/invitations/revoke/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

export async function acceptCourseInvitation(
  token: string,
): Promise<RawApiRecord | null> {
  return requestJson(
    `/courses/invitations/accept/${encodeURIComponent(token)}`,
    { method: "POST" },
  );
}
