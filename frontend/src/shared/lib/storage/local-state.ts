import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getLocalStorage } from './storage';

let storageWarningShown = false;
export const hasLocalStorageError = () => storageWarningShown;

export function reportStorageError(): void {
  if (typeof window === 'undefined') return;
  if (storageWarningShown) return;
  storageWarningShown = true;
  window.dispatchEvent(new Event('local-state-save-error'));
}

// Ошибка квоты/доступа не должна превращать успешный ответ API в ошибку запроса.
export const localStateStorage = {
  getItem: (key: string): string | null => {
    try {
      return getLocalStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      const storage = getLocalStorage();
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(key, value);
    } catch {
      reportStorageError();
    }
  },
  removeItem: (key: string): void => {
    try {
      getLocalStorage()?.removeItem(key);
    } catch {
      reportStorageError();
    }
  },
};

interface LocalState {
  value: unknown;
}
const stores = new Map<string, StoreApi<LocalState>>();

function matchesInitial(value: unknown, initial: unknown): boolean {
  if (initial === null) return true;
  if (Array.isArray(initial)) return Array.isArray(value);
  if (typeof initial === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    return Object.entries(initial as Record<string, unknown>).every(
      ([key, item]) =>
        matchesInitial((value as Record<string, unknown>)[key], item),
    );
  }
  return typeof value === typeof initial;
}

export function useLocalState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  let store = stores.get(key);
  if (!store) {
    const value =
      typeof initial === 'function' ? (initial as () => T)() : initial;
    store = createStore<LocalState>()(
      persist<LocalState>(() => ({ value }), {
        name: key,
        version: 1,
        storage: createJSONStorage(() => localStateStorage),
        merge: (persisted, current) => {
          const saved = persisted as Partial<LocalState> | undefined;
          return saved && matchesInitial(saved.value, current.value)
            ? { value: saved.value }
            : current;
        },
      }),
    );
    stores.set(key, store);
    store.setState({ value: store.getState().value });
  }
  const value = useStore(store, (state) => state.value) as T;
  const currentStore = store;
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      currentStore.setState((state) => ({
        value:
          typeof next === 'function'
            ? (next as (previous: T) => T)(state.value as T)
            : next,
      }));
    },
    [currentStore],
  );
  return [value, setValue];
}
