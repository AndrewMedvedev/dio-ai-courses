const getStoredTheme = () => {
  try {
    return JSON.parse(localStorage.getItem("app-theme-storage") || "{}")?.state
      ?.theme;
  } catch {
    return null;
  }
};

const resolveTheme = (theme) => {
  if (theme === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return theme === "dark" || theme === "light" ? theme : "light";
};

document.documentElement.dataset.theme = resolveTheme(getStoredTheme());
