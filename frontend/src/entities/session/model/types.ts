// Данные сессии с бэкенда. Бэкенд отдавал их в разных форматах (snake_case
// и camelCase, вложенные membership/organization), поэтому поля опциональны.

export interface OrganizationRef {
  id?: string;
  organization_id?: string;
  organizationId?: string;
  name?: string;
  title?: string;
}

export interface Membership {
  id?: string;
  membership_id?: string;
  organization_id?: string;
  organizationId?: string;
  organization?: OrganizationRef;
  organization_name?: string;
  joined_at?: string;
  permissions?: unknown[];
}

export interface Identity {
  id?: string;
  membership_id?: string;
  membershipId?: string;
  organization_id?: string;
  organizationId?: string;
  organization?: OrganizationRef;
  membership?: Membership;
  current_membership?: Membership;
  currentMembership?: Membership;
  roles?: unknown[];
  permissions?: unknown[];
  [key: string]: unknown;
}

export interface SessionUser {
  id?: string;
  user_id?: string;
  userId?: string;
  email?: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  avatarUrl?: string;
  [key: string]: unknown;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  authentication_token: string;
  memberships?: Membership[];
}

export type LoginStep = "credentials" | "organization";
