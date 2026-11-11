// Прогресс прохождения курса (backend: /progress/*).
import { requestJson, type PageParams, type RawApiRecord } from "@/shared/api";

// Прогресс всех учеников курса — для автора и преподавателей (страница метрик).
export async function fetchCourseStudentsProgress(
  courseId: string,
  { page = 1, size = 100 }: PageParams = {},
  options: RequestInit = {},
): Promise<{ items: RawApiRecord[]; total: number; hasNext: boolean }> {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  const data = await requestJson(
    `/progress/courses/${encodeURIComponent(courseId)}/students?${query.toString()}`,
    options,
  );
  const items = Array.isArray(data) ? data : data?.items || [];
  return {
    items,
    total: Number(data?.total) || items.length,
    hasNext: Boolean(data?.has_next ?? data?.hasNext),
  };
}

// Прогресс прохождения курса текущим учеником (backend: /progress/*).
export async function fetchCourseProgress(
  courseId: string,
  options: RequestInit = {},
): Promise<RawApiRecord | null> {
  return requestJson(
    `/progress/courses/${encodeURIComponent(courseId)}`,
    options,
  );
}

export async function createCourseProgress(
  courseId: string,
): Promise<RawApiRecord | null> {
  return requestJson(`/progress/courses/${encodeURIComponent(courseId)}`, {
    method: "POST",
  });
}

export async function recalculateCourseProgress(
  courseId: string,
  totalLessons: number,
): Promise<RawApiRecord | null> {
  const query = new URLSearchParams({
    total_lessons: String(Math.max(0, Number(totalLessons) || 0)),
  });
  return requestJson(
    `/progress/courses/${encodeURIComponent(courseId)}?${query.toString()}`,
    { method: "PATCH" },
  );
}

export async function fetchModuleProgress(
  moduleId: string,
  options: RequestInit = {},
): Promise<RawApiRecord | null> {
  return requestJson(
    `/progress/modules/${encodeURIComponent(moduleId)}`,
    options,
  );
}

export async function createModuleProgress(
  courseId: string,
  moduleId: string,
): Promise<RawApiRecord | null> {
  return requestJson(
    `/progress/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`,
    { method: "POST" },
  );
}

export async function fetchLessonProgress(
  lessonId: string,
  options: RequestInit = {},
): Promise<RawApiRecord | null> {
  return requestJson(
    `/progress/lessons/${encodeURIComponent(lessonId)}`,
    options,
  );
}

export async function createLessonProgress(
  moduleId: string,
  lessonId: string,
): Promise<RawApiRecord | null> {
  return requestJson(
    `/progress/module/${encodeURIComponent(moduleId)}/lessons/${encodeURIComponent(lessonId)}`,
    { method: "POST" },
  );
}

export async function completeLessonTheory(
  lessonId: string,
): Promise<RawApiRecord | null> {
  return requestJson(`/progress/lessons/${encodeURIComponent(lessonId)}`, {
    method: "PATCH",
  });
}
