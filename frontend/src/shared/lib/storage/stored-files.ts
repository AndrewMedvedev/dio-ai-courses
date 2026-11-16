import {
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { reportStorageError } from './local-state';

let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('course-local-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB unavailable'));
  });
  return database;
}

export async function readStoredFiles<T>(key: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').get(key);
    request.onsuccess = () =>
      resolve(Array.isArray(request.result) ? (request.result as T[]) : []);
    request.onerror = () =>
      reject(request.error ?? new Error('File read failed'));
  });
}

export async function writeStoredFiles<T>(
  key: string,
  files: T[],
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    const store = transaction.objectStore('files');
    if (files.length) store.put(files, key);
    else store.delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error('File save failed'));
  });
}

interface FileState {
  files: unknown[];
  ready: boolean;
  revision: number;
}
const stores = new Map<string, StoreApi<FileState>>();

export function useStoredFiles<T>(
  key: string,
): [T[], Dispatch<SetStateAction<T[]>>, boolean] {
  let store = stores.get(key);
  if (!store) {
    store = createStore<FileState>(() => ({
      files: [],
      ready: false,
      revision: 0,
    }));
    stores.set(key, store);
  }
  const state = useStore(store);
  const currentStore = store;
  useEffect(() => {
    if (currentStore.getState().ready) return;
    let active = true;
    const revision = currentStore.getState().revision;
    void readStoredFiles<T>(key)
      .then((files) => {
        if (active && currentStore.getState().revision === revision)
          currentStore.setState({ files, ready: true });
      })
      .catch(() => {
        if (active) {
          currentStore.setState({ ready: true });
          reportStorageError();
        }
      });
    return () => {
      active = false;
    };
  }, [key, currentStore]);
  const setFiles = useCallback<Dispatch<SetStateAction<T[]>>>(
    (next) => {
      const previous = currentStore.getState();
      const files =
        typeof next === 'function' ? next(previous.files as T[]) : next;
      currentStore.setState({
        files,
        ready: true,
        revision: previous.revision + 1,
      });
      void writeStoredFiles(key, files).catch(reportStorageError);
    },
    [key, currentStore],
  );
  return [state.files as T[], setFiles, state.ready];
}
