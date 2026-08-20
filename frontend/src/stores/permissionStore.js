import { create } from "zustand";
import { fetchPermissions } from "../utils/api";

export const COURSE_PERMISSIONS = {
  READ: "course.read",
  COURSE_READ: "course.course_read",
  CREATE: "course.create",
  UPDATE: "course.update",
  DELETE: "course.delete",
};

export const usePermissionStore = create((set, get) => ({
  permissions: [],
  isLoading: false,
  isLoaded: false,
  error: null,

  setPermissions: (permissions = []) =>
    set({ permissions, isLoading: false, isLoaded: true, error: null }),

  resetPermissions: () =>
    set({ permissions: [], isLoading: false, isLoaded: true, error: null }),

  loadPermissions: async () => {
    set({ isLoading: true, error: null });

    try {
      const firstPage = await fetchPermissions({ page: 1, size: 100 });
      const items = Array.isArray(firstPage?.items) ? firstPage.items : [];
      const totalPages = Number(firstPage?.pages) || 1;

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await fetchPermissions({ page, size: 100 });
        if (Array.isArray(nextPage?.items)) {
          items.push(...nextPage.items);
        }
      }

      const permissions = items
        .map((permission) => permission?.code)
        .filter(Boolean);

      set({ permissions, isLoading: false, isLoaded: true, error: null });
      return permissions;
    } catch (error) {
      set({
        permissions: [],
        isLoading: false,
        isLoaded: true,
        error: error?.message || "Не удалось настроить доступный функционал",
      });
      return [];
    }
  },

  hasPermission: (permission) => get().permissions.includes(permission),
  hasAnyPermission: (requiredPermissions) =>
    requiredPermissions.some((permission) =>
      get().permissions.includes(permission),
    ),
}));
