/** Откуда приглашение: в систему (iam) или в организацию существующего пользователя. */
export type InvitationSource = "iam" | "organization";

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface OrganizationInvitation {
  id: string;
  source: InvitationSource;
  email: string;
  organization_id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  status: InvitationStatus;
}

export interface InvitationPreview {
  email: string;
  registration_required: boolean;
  organization_id?: string | null;
  organization_name?: string | null;
}

export interface AcceptInvitationParams {
  token: string;
  password: string;
  full_name?: string;
  username?: string;
}

export interface Role {
  id: string;
  code: string;
  name?: string;
  description?: string;
}

export type InvitationType = "course" | "organization";
