import { create } from "zustand";
import { persist } from "zustand/middleware";

const THEME_STORAGE_KEY = "app-theme-storage";
const THEME_STORAGE_VERSION = 1;
const SUPPORTED_THEMES = new Set<string>(["light", "dark", "system"]);

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;

interface ThemeState {
  theme: Theme;
  hasHydrated: boolean;
  setHasHydrated: (hasHydrated: boolean) => void;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
}

type PersistedTheme = Pick<ThemeState, "theme">;

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export const resolveTheme = (theme: Theme): ResolvedTheme =>
  theme === "system" ? getSystemTheme() : theme;

export const useThemeStore = create<ThemeState>()(
  persist<ThemeState, [], [], PersistedTheme>(
    (set, get) => ({
      theme: "light" as Theme,
      hasHydrated: false,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setTheme: (theme) => {
        if (!SUPPORTED_THEMES.has(theme)) return;
        set({ theme: theme as Theme });
      },
      toggleTheme: () => {
        const currentTheme = resolveTheme(get().theme);
        set({ theme: currentTheme === "dark" ? "light" : "dark" });
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      version: THEME_STORAGE_VERSION,
      partialize: (state) => ({
        theme: SUPPORTED_THEMES.has(state.theme) ? state.theme : "light",
      }),
      migrate: (persistedState, version) => {
        if (version !== THEME_STORAGE_VERSION) {
          return { theme: "light" };
        }

        const state = persistedState as Partial<PersistedTheme> | undefined;
        return state?.theme && SUPPORTED_THEMES.has(state.theme)
          ? (state as PersistedTheme)
          : { theme: "light" };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
