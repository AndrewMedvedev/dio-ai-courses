import { buildQuery, requestJson, type RawApiRecord } from "@/shared/api";
import type {
  Organization,
  OrganizationPayload,
  OrganizationsPage,
} from "../model/types";

function normalizeOrganizationPage(
  response: RawApiRecord | null | undefined,
): OrganizationsPage {
  return {
    page: response?.page || 1,
    size: response?.size || 10,
    total_items: response?.total_items ?? response?.total ?? 0,
    total_pages: response?.total_pages ?? response?.pages ?? 1,
    has_next: Boolean(response?.has_next),
    has_prev: Boolean(response?.has_prev),
    items: Array.isArray(response?.items) ? response.items : [],
  };
}

function sanitizeOrganizationPayload(
  data: OrganizationPayload = {},
  { partial = false }: { partial?: boolean } = {},
) {
  const payload = {
    name: data.name,
    email: data.email,
    description: data.description,
  };

  if (!partial) return payload;

  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}

export async function fetchOrganizationsPage(
  params: Record<string, unknown> = {},
): Promise<OrganizationsPage> {
  const query = buildQuery(params);
  const response = await requestJson(
    `/organizations${query ? `?${query}` : ""}`,
  );
  return normalizeOrganizationPage(response);
}

export async function fetchOrganizationById(
  organizationId: string,
): Promise<Organization> {
  return requestJson(`/organizations/${encodeURIComponent(organizationId)}`);
}

export async function createOrganization(
  data: OrganizationPayload,
): Promise<Organization> {
  return requestJson("/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sanitizeOrganizationPayload(data)),
  });
}

export async function updateOrganization(
  organizationId: string,
  data: OrganizationPayload,
): Promise<Organization> {
  return requestJson(`/organizations/${encodeURIComponent(organizationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sanitizeOrganizationPayload(data, { partial: true })),
  });
}

export async function deleteOrganization(
  organizationId: string,
): Promise<unknown> {
  return requestJson(`/organizations/${encodeURIComponent(organizationId)}`, {
    method: "DELETE",
  });
}
