// Ответы агента и статус генерации курса: id задачи и курса, прогресс, тексты ошибок.
import type { RawApiRecord } from "@/shared/api";

const FAKE_PROGRESS_EASING_DURATION_MS = 30 * 60 * 1000;

export function estimateProgress(startedAt: string | null | undefined): number {
  const started = Date.parse(startedAt || "");
  const elapsed = Number.isFinite(started) ? Date.now() - started : 0;
  const ratio = Math.max(0, elapsed) / FAKE_PROGRESS_EASING_DURATION_MS;
  return Math.min(
    95,
    Math.max(4, Math.round(95 * (1 - Math.exp(-ratio * 1.1)))),
  );
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function getResponseSources(rawResponse: unknown): RawApiRecord[] {
  const response = rawResponse as RawApiRecord | null | undefined;
  return [
    response,
    parseMaybeJson(response?.content),
    response?.response,
    response?.data,
    response?.result,
  ].filter(
    (item): item is RawApiRecord => Boolean(item) && typeof item === "object",
  );
}

export function extractCourseId(response: unknown): string | null {
  const sources = getResponseSources(response);
  const source = sources.find(
    (item) => item.course_id || item.courseId || item.course?.id,
  );
  return source?.course_id || source?.courseId || source?.course?.id || null;
}

export function normalizeGenerationResponse(response: unknown): {
  taskId: string | null;
  courseId: string | null;
  startedAt: string | undefined;
} | null {
  const sources = getResponseSources(response);

  const taskId = sources.find(
    (item) => item.task_id || item.taskId || item.task || item.id,
  );
  const courseId = sources.find(
    (item) => item.course_id || item.courseId || item.course?.id,
  );
  const statusSource = sources.find(
    (item) =>
      item.status || item.course_status || item.courseStatus || item.state,
  );
  const startedSource = sources.find(
    (item) =>
      item.started_at || item.startedAt || item.created_at || item.createdAt,
  );
  const status = String(
    statusSource?.status ||
      statusSource?.course_status ||
      statusSource?.courseStatus ||
      statusSource?.state ||
      "",
  ).toLowerCase();
  const isGenerationStatus = ["in_generation", "generating", "queued"].includes(
    status,
  );
  const normalizedTaskId =
    taskId?.task_id || taskId?.taskId || taskId?.task || taskId?.id || null;
  const normalizedCourseId =
    courseId?.course_id || courseId?.courseId || courseId?.course?.id || null;

  if (!normalizedTaskId && !isGenerationStatus) return null;

  return {
    taskId: normalizedTaskId,
    courseId: normalizedCourseId,
    startedAt:
      startedSource?.started_at ||
      startedSource?.startedAt ||
      startedSource?.created_at ||
      startedSource?.createdAt ||
      undefined,
  };
}

export function safeMarkdownUrl(url: string): string {
  const value = String(url || "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^(\/|\.{1,2}\/|#)/.test(value)) return value;
  return value.includes(":") ? "" : value;
}

export function normalizeCourseStatus(status: unknown): string {
  return String(status || "")
    .trim()
    .toLowerCase();
}

export function isDraftCourseStatus(status: unknown): boolean {
  return normalizeCourseStatus(status) === "draft";
}

export function isGenerationCourseStatus(status: unknown): boolean {
  return ["in_generation", "generating", "queued"].includes(
    normalizeCourseStatus(status),
  );
}

export function getStatusErrorMessage(rawError: unknown): string {
  const error = rawError as { status?: number } | null;
  if (error?.status === 401) return "Сессия истекла. Войдите заново.";
  if (error?.status === 403) {
    return "Недостаточно прав для проверки статуса генерации курса.";
  }
  if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
    return "Не удалось проверить статус генерации курса.";
  }
  if (Number(error?.status) >= 500) {
    return "Не удалось сгенерировать курс из-за ошибки сервера. Попробуйте позже.";
  }
  return "Не удалось проверить статус генерации курса. Проверьте соединение и попробуйте позже.";
}
