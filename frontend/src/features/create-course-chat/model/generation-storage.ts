// Запущенная генерация курса в localStorage: после перезагрузки страницы
// чат продолжает ту же беседу и следит за той же генерацией.
import { getLocalStorage } from "@/shared/lib/storage";

export const ACTIVE_CREATOR_COURSE_KEY = "course-generation:active-course";

export interface StoredGeneration {
  courseId: string;
  chatId: string | null;
  taskId: string | null;
  generatedCourseId: string | null;
  generationStartedAt: string;
  status: string;
}

export function createUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    const digit = value === "x" ? random : (random & 0x3) | 0x8;
    return digit.toString(16);
  });
}

function getGenerationKey(courseId: string): string {
  return `course-generation:${courseId}`;
}

export function createCourseId(): string {
  return getLocalStorage()?.getItem(ACTIVE_CREATOR_COURSE_KEY) || createUuid();
}

export function readGenerationState(courseId: string): StoredGeneration | null {
  const storage = getLocalStorage();
  if (!storage || !courseId) return null;
  try {
    const value = JSON.parse(
      storage.getItem(getGenerationKey(courseId)) || "null",
    );
    return value?.courseId === courseId ? value : null;
  } catch {
    return null;
  }
}

export function writeGenerationState(record: StoredGeneration): void {
  const storage = getLocalStorage();
  if (!storage || !record?.courseId) return;
  storage.setItem(getGenerationKey(record.courseId), JSON.stringify(record));
  storage.setItem(ACTIVE_CREATOR_COURSE_KEY, record.courseId);
}

export function clearGenerationState(courseId: string): void {
  const storage = getLocalStorage();
  if (!storage || !courseId) return;
  storage.removeItem(getGenerationKey(courseId));
  if (storage.getItem(ACTIVE_CREATOR_COURSE_KEY) === courseId) {
    storage.removeItem(ACTIVE_CREATOR_COURSE_KEY);
  }
}
