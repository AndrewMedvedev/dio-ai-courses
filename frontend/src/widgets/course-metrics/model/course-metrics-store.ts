import { create } from "zustand";
import {
  getCourseStudents,
  type CourseStudent,
  type CourseStudentsPage,
} from "@/entities/course";
import { getUserById, type UserProfile } from "@/entities/user";
import { getTheorySessions, type TheorySession } from "@/entities/progress";
import type { PageParams } from "@/shared/api";

export interface StudentsMeta {
  page: number;
  size: number;
  total: number;
  pages: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Период на странице метрик: "7" | "30" | "all" | "custom". */
export type MetricsPeriod = "7" | "30" | "all" | "custom";

export interface SessionsFilters {
  period: MetricsPeriod;
  dateFrom: string;
  dateTo: string;
  createdFrom: string;
  createdTo: string;
  sort: string;
}

interface CourseMetricsState {
  students: CourseStudent[];
  studentsMeta: StudentsMeta;
  isStudentsLoading: boolean;
  studentsError: string;

  usersCache: Record<string, UserProfile>;
  usersLoading: Record<string, boolean>;
  usersErrors: Record<string, string>;

  selectedStudentUserId: string;

  sessions: TheorySession[];
  sessionsFilters: SessionsFilters;
  isSessionsLoading: boolean;
  sessionsError: string;
  sessionsRequestKey: string;

  setSelectedStudent: (userId: string | null | undefined) => void;
  resetSessions: () => void;
  resetSelectionAndSessions: () => void;
  setFilters: (filters: Partial<SessionsFilters>) => SessionsFilters;
  loadStudents: (
    courseId: string,
    params?: PageParams,
  ) => Promise<CourseStudentsPage | null>;
  loadUsersForStudents: (
    students: CourseStudent[] | null | undefined,
  ) => Promise<PromiseSettledResult<UserProfile>[]>;
  loadSessions: (
    lessonId: string,
    userId?: string,
  ) => Promise<TheorySession[] | null>;
}

const DEFAULT_STUDENTS_META: StudentsMeta = {
  page: 1,
  size: 10,
  total: 0,
  pages: 1,
  total_pages: 1,
  has_next: false,
  has_prev: false,
};

const DEFAULT_FILTERS: SessionsFilters = {
  // "7" | "30" | "all" | "custom" — быстрый выбор периода на странице метрик.
  period: "all",
  dateFrom: "",
  dateTo: "",
  createdFrom: "",
  createdTo: "",
  sort: "created_at",
};

let studentsController: AbortController | null = null;
let sessionsController: AbortController | null = null;
let studentsRequestId = 0;
let sessionsRequestId = 0;

function getErrorMessage(rawError: unknown, fallback: string): string {
  const error = rawError as { userMessage?: string; message?: string } | null;
  return error?.userMessage || error?.message || fallback;
}

function toEndExclusiveIso(dateValue: string): string {
  if (!dateValue) return "";
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  return date.toISOString();
}

function toStartInclusiveIso(dateValue: string): string {
  if (!dateValue) return "";
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return date.toISOString();
}

function normalizeFilters(filters: Partial<SessionsFilters>): SessionsFilters {
  const dateFrom = filters.dateFrom || "";
  const dateTo = filters.dateTo || "";
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    dateFrom,
    dateTo,
    createdFrom: toStartInclusiveIso(dateFrom),
    createdTo: toEndExclusiveIso(dateTo),
  };
}

function isDateRangeValid(filters: SessionsFilters): boolean {
  if (!filters.dateFrom || !filters.dateTo) return true;
  return filters.dateFrom <= filters.dateTo;
}

export const useCourseMetricsStore = create<CourseMetricsState>()((set, get) => ({
  students: [],
  studentsMeta: DEFAULT_STUDENTS_META,
  isStudentsLoading: false,
  studentsError: "",

  usersCache: {},
  usersLoading: {},
  usersErrors: {},

  selectedStudentUserId: "",

  sessions: [],
  sessionsFilters: DEFAULT_FILTERS,
  isSessionsLoading: false,
  sessionsError: "",
  sessionsRequestKey: "",

  setSelectedStudent: (userId) => {
    set({ selectedStudentUserId: userId || "" });
  },

  // Сбрасывает только сессии (другой урок): студент и период остаются.
  resetSessions: () => {
    if (sessionsController) {
      sessionsController.abort();
      sessionsController = null;
    }
    set({
      sessions: [],
      isSessionsLoading: false,
      sessionsError: "",
      sessionsRequestKey: "",
    });
  },

  resetSelectionAndSessions: () => {
    if (sessionsController) {
      sessionsController.abort();
      sessionsController = null;
    }
    set({
      selectedStudentUserId: "",
      sessions: [],
      isSessionsLoading: false,
      sessionsError: "",
      sessionsRequestKey: "",
    });
  },

  setFilters: (filters) => {
    const nextFilters = normalizeFilters({ ...get().sessionsFilters, ...filters });
    set({ sessionsFilters: nextFilters, sessionsError: "" });
    return nextFilters;
  },

  loadStudents: async (courseId, { page = 1, size = 10 } = {}) => {
    if (!courseId) return null;
    if (studentsController) studentsController.abort();
    studentsController = new AbortController();
    const requestId = studentsRequestId + 1;
    studentsRequestId = requestId;

    set({ isStudentsLoading: true, studentsError: "" });

    try {
      const response: CourseStudentsPage = await getCourseStudents(
        courseId,
        { page, size },
        { signal: studentsController.signal },
      );
      if (requestId !== studentsRequestId) return null;

      set({
        students: response.items,
        studentsMeta: {
          page: response.page || page,
          size: response.size || size,
          total: response.total || 0,
          pages: response.pages || response.total_pages || 1,
          total_pages: response.total_pages || response.pages || 1,
          has_next: Boolean(response.has_next),
          has_prev: Boolean(response.has_prev),
        },
        isStudentsLoading: false,
      });

      get().loadUsersForStudents(response.items);
      return response;
    } catch (error) {
      if (studentsController?.signal.aborted || requestId !== studentsRequestId) {
        return null;
      }
      set({
        students: [],
        studentsError: getErrorMessage(error, "Не удалось загрузить студентов курса."),
        isStudentsLoading: false,
      });
      throw error;
    }
  },

  loadUsersForStudents: async (students) => {
    const state = get();
    const userIds = [...new Set((students || []).map((student) => student.userId).filter(Boolean))]
      .filter((userId) => !state.usersCache[userId] && !state.usersLoading[userId]);

    if (!userIds.length) return [];

    set((current) => ({
      usersLoading: userIds.reduce<Record<string, boolean>>(
        (acc, userId) => ({ ...acc, [userId]: true }),
        current.usersLoading,
      ),
      usersErrors: userIds.reduce<Record<string, string>>(
        (acc, userId) => ({ ...acc, [userId]: "" }),
        current.usersErrors,
      ),
    }));

    const results = await Promise.allSettled(userIds.map((userId) => getUserById(userId)));

    set((current) => {
      const usersCache = { ...current.usersCache };
      const usersLoading = { ...current.usersLoading };
      const usersErrors = { ...current.usersErrors };

      results.forEach((result, index) => {
        const userId = userIds[index];
        usersLoading[userId] = false;
        if (result.status === "fulfilled") {
          usersCache[userId] = result.value;
          usersErrors[userId] = "";
        } else {
          usersErrors[userId] = getErrorMessage(
            result.reason,
            "Не удалось загрузить профиль студента.",
          );
        }
      });

      return { usersCache, usersLoading, usersErrors };
    });

    return results;
  },

  loadSessions: async (lessonId, userId = get().selectedStudentUserId) => {
    if (!lessonId || !userId) {
      set({ sessions: [], isSessionsLoading: false, sessionsError: "" });
      return null;
    }

    const filters = get().sessionsFilters;
    if (!isDateRangeValid(filters)) {
      set({ sessionsError: "Дата начала периода не должна быть позже даты окончания." });
      return null;
    }

    if (sessionsController) sessionsController.abort();
    sessionsController = new AbortController();
    const requestId = sessionsRequestId + 1;
    sessionsRequestId = requestId;
    const requestKey = JSON.stringify({ lessonId, userId, filters });

    set({
      isSessionsLoading: true,
      sessionsError: "",
      sessionsRequestKey: requestKey,
    });

    try {
      const sessions = await getTheorySessions(
        lessonId,
        userId,
        {
          createdFrom: filters.createdFrom,
          createdTo: filters.createdTo,
          sort: filters.sort,
        },
        { signal: sessionsController.signal },
      );

      if (requestId !== sessionsRequestId || get().sessionsRequestKey !== requestKey) {
        return null;
      }

      set({ sessions, isSessionsLoading: false, sessionsError: "" });
      return sessions;
    } catch (error) {
      if (sessionsController?.signal.aborted || requestId !== sessionsRequestId) {
        return null;
      }
      set({
        sessions: [],
        isSessionsLoading: false,
        sessionsError: getErrorMessage(error, "Не удалось загрузить метрики теории."),
      });
      throw error;
    }
  },
}));
