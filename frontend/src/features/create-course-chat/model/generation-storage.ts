import { toText } from '@/shared/lib/text';
import { asRecord } from '@/shared/api';
// Запущенная генерация курса в localStorage: после перезагрузки страницы
// чат продолжает ту же беседу и следит за той же генерацией.
import { localStateStorage } from '@/shared/lib/storage';

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
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    const digit = value === 'x' ? random : (random & 0x3) | 0x8;
    return digit.toString(16);
  });
}

function getGenerationKey(courseId: string, scope: string): string {
  return `course-generation:${scope}:${courseId}`;
}

export function readGenerationState(
  courseId: string,
  scope: string,
): StoredGeneration | null {
  if (!courseId) return null;
  try {
    const value = asRecord(
      JSON.parse(
        localStateStorage.getItem(getGenerationKey(courseId, scope)) || 'null',
      ),
    );
    if (value.courseId !== courseId) return null;
    return {
      courseId,
      chatId: toText(value.chatId) || null,
      taskId: toText(value.taskId) || null,
      generatedCourseId: toText(value.generatedCourseId) || null,
      generationStartedAt: toText(value.generationStartedAt),
      status: toText(value.status),
    };
  } catch {
    return null;
  }
}

export function writeGenerationState(
  record: StoredGeneration,
  scope: string,
): void {
  if (!record?.courseId) return;
  localStateStorage.setItem(
    getGenerationKey(record.courseId, scope),
    JSON.stringify(record),
  );
}

export function clearGenerationState(courseId: string, scope: string): void {
  if (!courseId) return;
  localStateStorage.removeItem(getGenerationKey(courseId, scope));
}
