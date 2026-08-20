import { usePermissionStore } from "../stores/permissionStore";

export default function PermissionGate({ permission, permissions, fallback = null, children }) {
  const userPermissions = usePermissionStore((state) => state.permissions);
  const requiredPermissions = permissions || (permission ? [permission] : []);

  const isAllowed = requiredPermissions.every((requiredPermission) =>
    userPermissions.includes(requiredPermission),
  );

  return isAllowed ? children : fallback;
}
