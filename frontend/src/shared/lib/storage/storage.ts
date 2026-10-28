interface GetLocalStorageOptions {
  requireWriteAccess?: boolean;
}

export function getLocalStorage({
  requireWriteAccess = false,
}: GetLocalStorageOptions = {}): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }

    if (requireWriteAccess) {
      const testKey = "__local_storage_access_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
    }

    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJsonFromStorage<T = unknown>(
  key: string,
  fallback: T | null = null,
): T | null {
  const storage = getLocalStorage();
  if (!storage) return fallback;

  try {
    const value = storage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
