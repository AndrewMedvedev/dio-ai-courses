import { create } from "zustand";
import { persist } from "zustand/middleware";

const UI_LAYOUT_STORAGE_KEY = "app-ui-layout-storage";
const UI_LAYOUT_STORAGE_VERSION = 2;
const MAX_SCROLL_POSITIONS = 50;
const MAX_ACTIVE_LESSON_TABS = 50;
const MAX_ROUTE_HISTORY = 40;
const DEFAULT_LESSON_TAB = "theory";
const SUPPORTED_LESSON_TABS = new Set<string>([
  "theory",
  "questions",
  "practice",
]);

export type LessonTab = "theory" | "questions" | "practice";
export type NavigationAction = "PUSH" | "POP" | "REPLACE";

type ScrollPositions = Record<string, number>;
type ActiveLessonTabs = Record<string, LessonTab>;

export interface UiLayoutState {
  activeProfileTab: string;
  coursesPage: number;
  scrollPositions: ScrollPositions;
  activeLessonTabs: ActiveLessonTabs;
  routeHistory: string[];
  hasHydrated: boolean;
  setHasHydrated: (hasHydrated: boolean) => void;
  setActiveProfileTab: (activeProfileTab: string) => void;
  setCoursesPage: (coursesPage: number | string) => void;
  getScrollPosition: (routeKey: string) => number | undefined;
  saveScrollPosition: (routeKey: string, scrollY: number) => void;
  clearScrollPositions: () => void;
  getLessonActiveTab: (contextKey: string) => LessonTab;
  setLessonActiveTab: (contextKey: string, tab: string) => void;
  clearLessonActiveTabs: () => void;
  recordRoute: (route: string, action?: NavigationAction) => void;
  getPreviousRoute: (currentRoute: string, fallbackRoute?: string) => string;
  resetRouteHistory: (route?: string) => void;
}

type PersistedUiLayout = Partial<
  Pick<
    UiLayoutState,
    | "activeProfileTab"
    | "coursesPage"
    | "scrollPositions"
    | "activeLessonTabs"
    | "routeHistory"
  >
>;

const normalizeScrollY = (value: number) =>
  Math.max(0, Math.round(Number.isFinite(value) ? value : 0));

const trimScrollPositions = (
  positions: ScrollPositions = {},
): ScrollPositions => {
  const entries = Object.entries(positions).filter(
    ([routeKey, scrollY]) =>
      typeof routeKey === "string" &&
      routeKey.length > 0 &&
      Number.isFinite(scrollY),
  );

  return Object.fromEntries(entries.slice(-MAX_SCROLL_POSITIONS));
};

const normalizeLessonTab = (tab: unknown): LessonTab =>
  typeof tab === "string" && SUPPORTED_LESSON_TABS.has(tab)
    ? (tab as LessonTab)
    : DEFAULT_LESSON_TAB;

const trimActiveLessonTabs = (
  tabs: ActiveLessonTabs = {},
): ActiveLessonTabs => {
  const entries = Object.entries(tabs)
    .filter(
      ([contextKey, tab]) =>
        typeof contextKey === "string" &&
        contextKey.length > 0 &&
        SUPPORTED_LESSON_TABS.has(tab),
    )
    .slice(-MAX_ACTIVE_LESSON_TABS);

  return Object.fromEntries(entries);
};

const normalizeRoute = (route: unknown): string => {
  const value = typeof route === "string" ? route.trim() : "";
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  return value;
};

const shouldSkipRouteHistory = (route: string) => {
  const pathname = normalizeRoute(route).split(/[?#]/, 1)[0];
  return pathname === "/login" || pathname === "/register";
};

const trimRouteHistory = (history: string[] = []) =>
  history.map(normalizeRoute).filter(Boolean).slice(-MAX_ROUTE_HISTORY);

export const useUiLayoutStore = create<UiLayoutState>()(
  persist<UiLayoutState, [], [], PersistedUiLayout>(
    (set, get) => ({
      activeProfileTab: "overview",
      coursesPage: 1,
      scrollPositions: {},
      activeLessonTabs: {},
      routeHistory: [],
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
      getLessonActiveTab: (contextKey) =>
        normalizeLessonTab(get().activeLessonTabs[contextKey]),
      setLessonActiveTab: (contextKey, tab) => {
        if (typeof contextKey !== "string" || !contextKey) return;

        set((state) => ({
          activeLessonTabs: trimActiveLessonTabs({
            ...state.activeLessonTabs,
            [contextKey]: normalizeLessonTab(tab),
          }),
        }));
      },
      clearLessonActiveTabs: () => set({ activeLessonTabs: {} }),
      recordRoute: (route, action = "PUSH") => {
        const nextRoute = normalizeRoute(route);
        if (!nextRoute || shouldSkipRouteHistory(nextRoute)) return;

        set((state) => {
          const routeHistory = trimRouteHistory(state.routeHistory);
          const lastRoute = routeHistory[routeHistory.length - 1];

          if (lastRoute === nextRoute) {
            return { routeHistory };
          }

          if (action === "POP") {
            const existingRouteIndex = routeHistory.lastIndexOf(nextRoute);
            if (existingRouteIndex >= 0) {
              return {
                routeHistory: routeHistory.slice(0, existingRouteIndex + 1),
              };
            }
          }

          if (action === "REPLACE" && routeHistory.length > 0) {
            return {
              routeHistory: [...routeHistory.slice(0, -1), nextRoute],
            };
          }

          return {
            routeHistory: trimRouteHistory([...routeHistory, nextRoute]),
          };
        });
      },
      getPreviousRoute: (currentRoute, fallbackRoute = "/") => {
        const normalizedCurrentRoute = normalizeRoute(currentRoute);
        const normalizedFallbackRoute = normalizeRoute(fallbackRoute) || "/";
        const routeHistory = trimRouteHistory(get().routeHistory).filter(
          (route) =>
            route !== normalizedCurrentRoute && !shouldSkipRouteHistory(route),
        );

        return routeHistory[routeHistory.length - 1] || normalizedFallbackRoute;
      },
      resetRouteHistory: (route = "/") => {
        const normalizedRoute = normalizeRoute(route) || "/";
        set({
          routeHistory: shouldSkipRouteHistory(normalizedRoute)
            ? []
            : [normalizedRoute],
        });
      },
    }),
    {
      name: UI_LAYOUT_STORAGE_KEY,
      version: UI_LAYOUT_STORAGE_VERSION,
      // Персистим только лёгкие UI-флаги и id/key -> primitive mappings;
      // серверные списки, токены и производные данные здесь не хранятся.
      partialize: (state) => ({
        activeProfileTab: state.activeProfileTab,
        coursesPage: state.coursesPage,
        scrollPositions: trimScrollPositions(state.scrollPositions),
        activeLessonTabs: trimActiveLessonTabs(state.activeLessonTabs),
      }),
      migrate: (rawState) => {
        const persistedState = rawState as PersistedUiLayout | undefined;
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
          activeLessonTabs: trimActiveLessonTabs(
            persistedState?.activeLessonTabs || {},
          ),
          routeHistory: [],
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
