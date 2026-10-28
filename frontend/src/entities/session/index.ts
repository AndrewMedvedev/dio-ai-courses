export {
  authenticateWithMembership,
  fetchCurrentUser,
  fetchIdentity,
  login,
  logout,
  updateCurrentUser,
} from "./api/session-api";
export { usePermissionStore } from "./model/permission-store";
export {
  AI_MODEL_PERMISSIONS,
  COURSE_PERMISSIONS,
  INVITATION_PERMISSIONS,
  ORGANIZATION_PERMISSIONS,
  extractPermissionsFromIdentity,
  normalizePermissionCode,
  type PermissionInput,
} from "./model/permissions";
export { useSessionStore, type SessionState } from "./model/session-store";
export type {
  Identity,
  LoginCredentials,
  LoginResponse,
  LoginStep,
  Membership,
  OrganizationRef,
  SessionUser,
} from "./model/types";
export { useAppPermissions } from "./model/use-app-permissions";
export { PermissionGate, type PermissionGateProps } from "./ui/PermissionGate";
