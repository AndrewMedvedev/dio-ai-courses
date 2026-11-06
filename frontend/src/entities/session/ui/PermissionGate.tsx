import type { ReactNode } from "react";
import { usePermissionStore } from "../model/permission-store";
import type { PermissionInput } from "../model/permissions";

export interface PermissionGateProps {
  permission?: PermissionInput;
  permissions?: PermissionInput[];
  /** true — нужны все права, false — хотя бы одно. */
  requireAll?: boolean;
  fallback?: ReactNode;
  children?: ReactNode;
}

export function PermissionGate({
  permission,
  permissions,
  requireAll = true,
  fallback = null,
  children,
}: PermissionGateProps) {
  const hasAnyPermission = usePermissionStore(
    (state) => state.hasAnyPermission,
  );
  const hasAllPermissions = usePermissionStore(
    (state) => state.hasAllPermissions,
  );
  const requiredPermissions = permissions || (permission ? [permission] : []);
  const isAllowed =
    requiredPermissions.length === 0 ||
    (requireAll
      ? hasAllPermissions(requiredPermissions)
      : hasAnyPermission(requiredPermissions));

  return <>{isAllowed ? children : fallback}</>;
}
