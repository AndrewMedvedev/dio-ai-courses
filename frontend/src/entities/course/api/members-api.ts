// Запись на курс, ученики курса и курсы текущего ученика (backend: /members).
import { apiFetch, type PageParams, type RawApiRecord } from "@/shared/api";
import { mapCourseFromApi } from "../lib/mappers";
import type { CoursesPage } from "../model/types";

export interface CourseStudent {
  id: string;
  courseId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CourseStudentsPage {
  items: CourseStudent[];
  page: number;
  size: number;
  total: number;
  pages: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Ошибка запроса к /members с понятным сообщением. */
export interface MembersError extends Error {
  status?: number;
  payload?: unknown;
  userMessage?: string;
}

function normalizePaginatedCourses(
  data: RawApiRecord | null | undefined,
  { page = 1, size = 10 }: PageParams = {},
): CoursesPage {
  const rawItems = Array.isArray(data)
    ? data
    : data?.items || data?.courses || data?.results || [];
  const items = rawItems.map(mapCourseFromApi);
  const total =
    Number(data?.total) || Number(data?.total_items) || items.length;
  const pages =
    Number(data?.pages) ||
    Number(data?.total_pages) ||
    Math.max(1, Math.ceil(total / Math.max(1, size)));

  return {
    ...data,
    items,
    page: Number(data?.page) || page,
    size: Number(data?.size) || size,
    total,
    pages,
    total_pages: pages,
    has_next: Boolean(data?.has_next ?? data?.hasNext ?? page < pages),
    has_prev: Boolean(data?.has_prev ?? data?.hasPrev ?? page > 1),
  };
}

async function parseError(
  response: Response,
  fallbackMessage: string,
): Promise<MembersError> {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  const detail = payload?.detail || payload?.error?.message || payload;
  const message =
    typeof detail === "string" && detail.trim() ? detail : fallbackMessage;
  const error: MembersError = new Error(message);
  error.status = response.status;
  error.payload = payload;
  error.userMessage = message;
  return error;
}

export async function signCourse(
  courseId: string,
  options: RequestInit = {},
): Promise<RawApiRecord> {
  const response = await apiFetch(
    `/members/${encodeURIComponent(courseId)}/enroll`,
    {
      ...options,
      method: "POST",
    },
  );

  if (!response.ok) {
    throw await parseError(response, "Не удалось записаться на курс.");
  }

  return response.json();
}

function normalizeStudent(raw: RawApiRecord = {}): CourseStudent {
  return {
    id: raw.id || "",
    courseId: raw.course_id || raw.courseId || "",
    userId: raw.user_id || raw.userId || "",
    createdAt: raw.created_at || raw.createdAt || "",
    updatedAt: raw.updated_at || raw.updatedAt || "",
    deletedAt: raw.deleted_at ?? raw.deletedAt ?? null,
  };
}

function normalizeStudentPage(
  data: RawApiRecord | null | undefined,
  { page = 1, size = 10 }: PageParams = {},
): CourseStudentsPage {
  const items = (data?.items || []).map(normalizeStudent);
  const total = Number(data?.total) || items.length;
  const pages =
    Number(data?.pages) || Math.max(1, Math.ceil(total / Math.max(1, size)));

  return {
    items,
    page: Number(data?.page) || page,
    size: Number(data?.size) || size,
    total,
    pages,
    total_pages: pages,
    has_next: Boolean(data?.has_next ?? data?.hasNext ?? page < pages),
    has_prev: Boolean(data?.has_prev ?? data?.hasPrev ?? page > 1),
  };
}

export async function getCourseStudents(
  courseId: string,
  { page = 1, size = 10 }: PageParams = {},
  options: RequestInit = {},
): Promise<CourseStudentsPage> {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  const response = await apiFetch(
    `/members/${encodeURIComponent(courseId)}?${query.toString()}`,
    {
      ...options,
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await parseError(response, "Не удалось загрузить студентов курса.");
  }

  const data = await response.json();
  return normalizeStudentPage(data, { page, size });
}

export async function getMyCourses(
  { page = 1, size = 10 }: PageParams = {},
  options: RequestInit = {},
): Promise<CoursesPage> {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  const response = await apiFetch(`/members?${query.toString()}`, {
    ...options,
    method: "GET",
  });

  if (!response.ok) {
    throw await parseError(response, "Не удалось загрузить ваши курсы.");
  }

  const data = await response.json();
  return normalizePaginatedCourses(data, { page, size });
}
