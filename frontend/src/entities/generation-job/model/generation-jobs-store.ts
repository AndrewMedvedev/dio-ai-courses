import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getLocalStorage } from "@/shared/lib/storage";

/**
 * Запущенные генерации модулей и уроков из редактора курса.
 * На backend нет статуса задачи по task_id, поэтому фронт отслеживает результат сам:
 * перечитывает курс (модуль) или модуль (урок), пока не появится новый элемент.
 *
 * jobs[key] = {
 *   key, kind: "module" | "lesson", courseId, moduleId, order, taskId, chatKey,
 *   knownIds: string[], startedAt, status: "running" | "done" | "error",
 *   resultId, resultTitle, lessonsCount, lastChangeAt, error
 * }
 */

export type GenerationJobKind = "module" | "lesson";
export type GenerationJobStatus = "running" | "done" | "error";

export interface GenerationJob {
  key: string;
  kind: GenerationJobKind;
  courseId: string;
  moduleId?: string;
  order?: number;
  taskId?: string | null;
  chatKey?: string;
  knownIds: string[];
  startedAt: string;
  status: GenerationJobStatus;
  resultId: string | null;
  resultTitle: string;
  lessonsCount: number;
  lastChangeAt: string | null;
  error: string;
}

/** Новая задача: остальные поля заполнятся значениями по умолчанию. */
export type NewGenerationJob = Pick<
  GenerationJob,
  "key" | "kind" | "courseId"
> &
  Partial<GenerationJob>;

interface GenerationJobsState {
  jobs: Record<string, GenerationJob>;
  startJob: (job: NewGenerationJob) => void;
  updateJob: (key: string, patch: Partial<GenerationJob>) => void;
  removeJob: (key: string) => void;
  getJob: (key: string) => GenerationJob | null;
}

const MEMORY_STORAGE = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const generationJobKey = (
  kind: GenerationJobKind,
  courseId: string,
  contextId = "",
) => [kind, courseId, contextId].join(":");

export const useGenerationJobsStore = create<GenerationJobsState>()(
  persist<GenerationJobsState, [], [], Pick<GenerationJobsState, "jobs">>(
    (set, get) => ({
      jobs: {},

      startJob: (job) =>
        set((state) => ({
          jobs: {
            ...state.jobs,
            [job.key]: {
              status: "running",
              resultId: null,
              resultTitle: "",
              lessonsCount: 0,
              lastChangeAt: null,
              error: "",
              startedAt: new Date().toISOString(),
              knownIds: [],
              ...job,
            } as GenerationJob,
          },
        })),

      updateJob: (key, patch) =>
        set((state) =>
          state.jobs[key]
            ? {
                jobs: {
                  ...state.jobs,
                  [key]: { ...state.jobs[key], ...patch },
                },
              }
            : {},
        ),

      removeJob: (key) =>
        set((state) => {
          if (!state.jobs[key]) return {};
          const jobs = { ...state.jobs };
          delete jobs[key];
          return { jobs };
        }),

      getJob: (key) => get().jobs[key] || null,
    }),
    {
      name: "ai-course-generation-jobs-v1",
      version: 1,
      storage: createJSONStorage(() => getLocalStorage() || MEMORY_STORAGE),
      partialize: (state) => ({ jobs: state.jobs }),
    },
  ),
);
