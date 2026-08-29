import { create } from "zustand";
import { persist } from "zustand/middleware";

const UI_LAYOUT_STORAGE_KEY = "app-ui-layout-storage";
const UI_LAYOUT_STORAGE_VERSION = 1;
const MAX_SCROLL_POSITIONS = 50;

const normalizeScrollY = (value) =>
  Math.max(0, Math.round(Number.isFinite(value) ? value : 0));

const trimScrollPositions = (positions) => {
  const entries = Object.entries(positions).filter(
    ([routeKey, scrollY]) =>
      typeof routeKey === "string" &&
      routeKey.length > 0 &&
      Number.isFinite(scrollY),
  );

  return Object.fromEntries(entries.slice(-MAX_SCROLL_POSITIONS));
};

export const useUiLayoutStore = create(
  persist(
    (set, get) => ({
      activeProfileTab: "overview",
      coursesPage: 1,
      scrollPositions: {},
      hasHydrated: false,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setActiveProfileTab: (activeProfileTab) => {
        if (typeof activeProfileTab !== "string" || !activeProfileTab.trim()) {
          return;
        }
        set({ activeProfileTab });
      },
      setCoursesPage: (coursesPage) =>
        set({ coursesPage: Math.max(1, Math.round(Number(coursesPage) || 1)) }),
      getScrollPosition: (routeKey) => get().scrollPositions[routeKey],
      saveScrollPosition: (routeKey, scrollY) => {
        if (typeof routeKey !== "string" || !routeKey) return;

        set((state) => ({
          scrollPositions: trimScrollPositions({
            ...state.scrollPositions,
            [routeKey]: normalizeScrollY(scrollY),
          }),
        }));
      },
      clearScrollPositions: () => set({ scrollPositions: {} }),
    }),
    {
      name: UI_LAYOUT_STORAGE_KEY,
      version: UI_LAYOUT_STORAGE_VERSION,
      partialize: (state) => ({
        activeProfileTab: state.activeProfileTab,
        coursesPage: state.coursesPage,
        scrollPositions: trimScrollPositions(state.scrollPositions),
      }),
      migrate: (persistedState, version) => {
        if (version !== UI_LAYOUT_STORAGE_VERSION) {
          return {
            activeProfileTab: "overview",
            coursesPage: 1,
            scrollPositions: {},
          };
        }

        return {
          activeProfileTab:
            typeof persistedState?.activeProfileTab === "string" &&
            persistedState.activeProfileTab.trim()
              ? persistedState.activeProfileTab
              : "overview",
          coursesPage: Math.max(
            1,
            Math.round(Number(persistedState?.coursesPage) || 1),
          ),
          scrollPositions: trimScrollPositions(
            persistedState?.scrollPositions || {},
          ),
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
