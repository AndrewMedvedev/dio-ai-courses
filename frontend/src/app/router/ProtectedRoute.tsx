import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation, type Location } from "react-router-dom";
import {
  usePermissionStore,
  useSessionStore,
  type PermissionInput,
} from "@/entities/session";
import { isTokenExpired } from "@/shared/api";

function buildRedirect(location: Location) {
  return `${location.pathname}${location.search}`;
}

function AccessDenied() {
  return (
    <section className="container section">
      <article className="glass-card course-viewer-error">
        <h1>Доступ ограничен</h1>
        <p>
          У вашей роли нет разрешений для этого раздела. Обратитесь к
          администратору организации, чтобы получить доступ.
        </p>
      </article>
    </section>
  );
}

export interface ProtectedRouteProps {
  children?: ReactNode;
  permission?: PermissionInput;
  permissions?: PermissionInput[];
  /** true — нужны все права, false — хотя бы одно. */
  requireAll?: boolean;
  fallback?: ReactNode;
}

export function ProtectedRoute({
  children,
  permission,
  permissions,
  requireAll = true,
  fallback = <AccessDenied />,
}: ProtectedRouteProps) {
  const location = useLocation();
  const accessToken = useSessionStore((state) => state.accessToken);
  const refreshToken = useSessionStore((state) => state.refreshToken);
  const expiresAt = useSessionStore((state) => state.expiresAt);
  const membershipId = useSessionStore((state) => state.membershipId);
  const organizationId = useSessionStore((state) => state.organizationId);
  const arePermissionsLoaded = usePermissionStore((state) => state.isLoaded);
  const hasAnyPermission = usePermissionStore(
    (state) => state.hasAnyPermission,
  );
  const hasAllPermissions = usePermissionStore(
    (state) => state.hasAllPermissions,
  );
  const isAuthenticated = Boolean(
    accessToken && expiresAt && (!isTokenExpired(expiresAt) || refreshToken),
  );
  const requiredPermissions = permissions || (permission ? [permission] : []);

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(buildRedirect(location))}`}
        replace
      />
    );
  }

  if (!membershipId && !organizationId) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(buildRedirect(location))}`}
        replace
      />
    );
  }

  if (requiredPermissions.length > 0 && !arePermissionsLoaded) {
    return (
      <section className="container section">
        <article className="glass-card">
          <p className="course-details-text">Проверяем права доступа...</p>
        </article>
      </section>
    );
  }

  const isAllowed =
    requiredPermissions.length === 0 ||
    (requireAll
      ? hasAllPermissions(requiredPermissions)
      : hasAnyPermission(requiredPermissions));

  if (!isAllowed) {
    return <>{fallback}</>;
  }

  return children || <Outlet />;
}
