import { readJsonFromStorage } from "../utils/storage";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

interface StoredTheme {
  state?: { theme?: Theme };
}

const getStoredTheme = (): Theme | undefined =>
  (readJsonFromStorage("app-theme-storage") as StoredTheme | null)?.state?.theme;

const resolveTheme = (theme: Theme | undefined): ResolvedTheme => {
  if (theme === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return theme === "dark" || theme === "light" ? theme : "light";
};

document.documentElement.dataset.theme = resolveTheme(getStoredTheme());
