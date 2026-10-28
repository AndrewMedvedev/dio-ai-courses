import { create } from "zustand";
import { fetchIdentity } from "../api/session-api";
import {
  extractPermissionsFromIdentity,
  normalizePermissionCode,
  type PermissionInput,
} from "./permissions";
import type { Identity } from "./types";

interface PermissionState {
  permissions: string[];
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  setPermissions: (permissions?: PermissionInput[]) => void;
  setPermissionsFromIdentity: (identity: Identity | null | undefined) => void;
  resetPermissions: () => void;
  loadPermissions: () => Promise<string[]>;
  hasPermission: (permission: PermissionInput) => boolean;
  hasAnyPermission: (requiredPermissions?: PermissionInput[]) => boolean;
  hasAllPermissions: (requiredPermissions?: PermissionInput[]) => boolean;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: [],
  isLoading: false,
  isLoaded: false,
  error: null,

  setPermissions: (permissions = []) =>
    set({
      permissions: permissions.map(normalizePermissionCode).filter(Boolean),
      isLoading: false,
      isLoaded: true,
      error: null,
    }),

  setPermissionsFromIdentity: (identity) =>
    set({
      permissions: extractPermissionsFromIdentity(identity),
      isLoading: false,
      isLoaded: true,
      error: null,
    }),

  resetPermissions: () =>
    set({ permissions: [], isLoading: false, isLoaded: true, error: null }),

  loadPermissions: async () => {
    set({ isLoading: true, error: null });

    try {
      const identity = await fetchIdentity();
      const permissions = extractPermissionsFromIdentity(identity);

      set({ permissions, isLoading: false, isLoaded: true, error: null });
      return permissions;
    } catch (error) {
      set({
        permissions: [],
        isLoading: false,
        isLoaded: true,
        error:
          (error as Error | null)?.message ||
          "Не удалось настроить доступный функционал",
      });
      return [];
    }
  },

  hasPermission: (permission) =>
    get().permissions.includes(normalizePermissionCode(permission)),
  hasAnyPermission: (requiredPermissions = []) =>
    requiredPermissions.some((permission) =>
      get().permissions.includes(normalizePermissionCode(permission)),
    ),
  hasAllPermissions: (requiredPermissions = []) =>
    requiredPermissions.every((permission) =>
      get().permissions.includes(normalizePermissionCode(permission)),
    ),
}));
