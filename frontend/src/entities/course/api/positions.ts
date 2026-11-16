import { toText } from '@/shared/lib/text';
import {
  asRecords,
  requestJson,
  type RawApiRecord,
  type RequestOptions,
} from '@/shared/api';

export interface RelativePosition {
  beforeId?: string;
  afterId?: string;
}
const queues = new Map<string, Promise<unknown>>();
const lessonParents = new Map<string, string>();
export function serializeCourseChange<T>(
  courseId: string,
  action: () => Promise<T>,
): Promise<T> {
  const next = (queues.get(courseId) || Promise.resolve()).then(action, action);
  queues.set(courseId, next);
  void next
    .finally(() => {
      if (queues.get(courseId) === next) queues.delete(courseId);
    })
    .catch(() => {});
  return next;
}
export function positionAt(
  items: RawApiRecord[],
  order?: number,
  exclude?: string,
): RelativePosition {
  const sorted = [...items]
    .sort((a, b) =>
      typeof a.rank === 'string' && typeof b.rank === 'string'
        ? a.rank < b.rank
          ? -1
          : a.rank > b.rank
            ? 1
            : 0
        : Number(a.order || 0) - Number(b.order || 0),
    )
    .filter((item) => item.id !== exclude);
  const index = Number.isFinite(order)
    ? Math.max(0, Number(order) - 1)
    : sorted.length;
  return sorted[index]?.id ? { beforeId: toText(sorted[index].id) } : {};
}
export async function getModulePosition(
  courseId: string,
  order?: number,
  exclude?: string,
): Promise<RelativePosition> {
  if (!Number.isFinite(order)) return {};
  const course = await requestJson(`/courses/${encodeURIComponent(courseId)}`);
  return positionAt(asRecords(course.modules), order, exclude);
}
export async function getLessonPosition(
  moduleId: string,
  order?: number,
  exclude?: string,
): Promise<RelativePosition> {
  const module = await requestJson(`/modules/${encodeURIComponent(moduleId)}`);
  for (const lesson of asRecords(module.lessons))
    lessonParents.set(String(lesson.id), moduleId);
  return positionAt(asRecords(module.lessons), order, exclude);
}
export function rememberLessonParent(lessonId: string, moduleId: string) {
  lessonParents.set(lessonId, moduleId);
}
export async function findLessonParent(
  courseId: string,
  lessonId: string,
): Promise<string> {
  if (lessonParents.has(lessonId)) return lessonParents.get(lessonId)!;
  const course = await requestJson(`/courses/${encodeURIComponent(courseId)}`);
  for (const module of asRecords(course.modules)) {
    await getLessonPosition(String(module.id));
    if (lessonParents.has(lessonId)) return lessonParents.get(lessonId)!;
  }
  throw new Error('Не удалось найти модуль урока. Обновите курс.');
}
export function moveModuleRequest(
  moduleId: string,
  courseId: string,
  position: RelativePosition,
  options: RequestOptions = {},
) {
  return requestJson(
    `/modules/${encodeURIComponent(moduleId)}/move`,
    {
      method: 'PATCH',
      body: JSON.stringify({ courseId, position }),
      headers: { 'Content-Type': 'application/json' },
    },
    options,
  );
}
export async function moveLessonRequest(
  lessonId: string,
  moduleId: string,
  position: RelativePosition,
  options: RequestOptions = {},
) {
  const result = await requestJson(
    `/lessons/${encodeURIComponent(lessonId)}/move`,
    {
      method: 'PATCH',
      body: JSON.stringify({ moduleId, position }),
      headers: { 'Content-Type': 'application/json' },
    },
    options,
  );
  rememberLessonParent(lessonId, moduleId);
  return result;
}
