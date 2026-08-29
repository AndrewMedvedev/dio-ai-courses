import {
  AI_MODEL_PERMISSIONS,
  COURSE_PERMISSIONS,
  ORGANIZATION_PERMISSIONS,
  usePermissionStore,
} from "../stores/permissionStore";
import { useSessionStore } from "../stores/sessionStore";
import { isTokenExpired } from "../utils/api";

export function useAppPermissions() {
  const hasPermission = usePermissionStore((state) => state.hasPermission);
  const hasAnyPermission = usePermissionStore((state) => state.hasAnyPermission);
  const arePermissionsLoaded = usePermissionStore((state) => state.isLoaded);
  const accessToken = useSessionStore((state) => state.accessToken);
  const refreshToken = useSessionStore((state) => state.refreshToken);
  const expiresAt = useSessionStore((state) => state.expiresAt);

  const isAuthenticated = Boolean(
    accessToken && refreshToken && expiresAt && !isTokenExpired(expiresAt),
  );
  const canCreateCourse =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(COURSE_PERMISSIONS.CREATE);
  const canReadCourse =
    isAuthenticated && arePermissionsLoaded && hasPermission(COURSE_PERMISSIONS.READ);
  const canOpenCourse =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasAnyPermission([
      COURSE_PERMISSIONS.READ,
      COURSE_PERMISSIONS.COURSE_READ,
      COURSE_PERMISSIONS.UPDATE,
    ]);
  const canBrowseCourses = !isAuthenticated || canReadCourse;
  const canViewCourseInfo = !isAuthenticated || canOpenCourse;
  const canUpdateCourse =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(COURSE_PERMISSIONS.UPDATE);
  const canDeleteCourse =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(COURSE_PERMISSIONS.DELETE);
  const canCreateOrganization =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(ORGANIZATION_PERMISSIONS.CREATE);
  const canReadOrganization =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(ORGANIZATION_PERMISSIONS.READ);
  const canReadOwnOrganization =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(ORGANIZATION_PERMISSIONS.ORGANIZATION_READ);
  const canUpdateOrganization =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(ORGANIZATION_PERMISSIONS.UPDATE);
  const canDeleteOrganization =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(ORGANIZATION_PERMISSIONS.DELETE);
  const canManageOrganizations =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasAnyPermission(Object.values(ORGANIZATION_PERMISSIONS));
  const canCreateModel =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasAnyPermission([AI_MODEL_PERMISSIONS.CREATE, "ai_model:CREATE", "CREATE"]);
  const canDeleteModel =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasAnyPermission([AI_MODEL_PERMISSIONS.DELETE, "ai_model:DELETE", "DELETE"]);
  const canManageModels = isAuthenticated && arePermissionsLoaded;

  return {
    accessToken,
    refreshToken,
    isAuthenticated,
    arePermissionsLoaded,
    canCreateCourse,
    canReadCourse,
    canOpenCourse,
    canBrowseCourses,
    canViewCourseInfo,
    canUpdateCourse,
    canDeleteCourse,
    canCreateOrganization,
    canReadOrganization,
    canReadOwnOrganization,
    canUpdateOrganization,
    canDeleteOrganization,
    canManageOrganizations,
    canCreateModel,
    canDeleteModel,
    canManageModels,
  };
}
