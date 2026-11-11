import { useEffect, useRef } from "react";
import {
  forgetCourseCache,
  getCourseBasicInfo,
  getLessonBasicInfo,
  getModuleBasicInfo,
  type LearningBlock,
  type LearningLesson,
} from "@/entities/course";
import {
  useGenerationJobsStore,
  type GenerationJob,
} from "@/entities/generation-job";
import { isAgentMockEnabled } from "@/shared/lib/agent-mock";

type UpdateJob = (key: string, patch: Partial<GenerationJob>) => void;
type OnModule = (courseId: string, module: LearningBlock) => void;
type OnLesson = (
  courseId: string,
  moduleId: string,
  lesson: LearningLesson | { id?: string; title?: string; order?: number },
) => void;

export interface GenerationJobsWatcherOptions {
  enabled?: boolean;
  onModule?: OnModule;
  onLesson?: OnLesson;
  onDone?: (job: GenerationJob) => void;
}

interface OrderedItem {
  id?: string;
  order?: number;
  title?: string;
}

// В демо-режиме (?ai-mock=1) «генерация» идёт секунды, поэтому опрашиваем чаще.
const POLL_INTERVAL_MS = isAgentMockEnabled() ? 3000 : 8000;
// Модуль сохраняется до уроков, уроки дописываются по одному. Считаем модуль готовым,
// когда в нём есть уроки и их число не меняется заданное время.
const MODULE_STABLE_MS = isAgentMockEnabled() ? 12_000 : 90_000;
const JOB_TIMEOUT_MS = 45 * 60 * 1000;

function elapsedSince(iso: string | null | undefined): number {
  const time = Date.parse(iso || "");
  return Number.isFinite(time) ? Date.now() - time : 0;
}

function pickNewItem<T extends OrderedItem>(
  items: T[] | null | undefined,
  knownIds: string[] | null | undefined,
  order: number | undefined,
): T | null {
  const known = new Set(knownIds || []);
  const fresh = (items || []).filter((item) => item?.id && !known.has(item.id));
  if (!fresh.length) return null;
  return (
    fresh.find((item) => Number(item.order) === Number(order)) ||
    fresh[fresh.length - 1]
  );
}

async function checkModuleJob(
  job: GenerationJob,
  { updateJob, onModule }: { updateJob: UpdateJob; onModule?: OnModule },
): Promise<void> {
  let moduleId = job.resultId;
  if (!moduleId) {
    const course = await getCourseBasicInfo(job.courseId);
    const created = pickNewItem(course?.blocks, job.knownIds, job.order);
    if (!created) {
      if (elapsedSince(job.startedAt) > JOB_TIMEOUT_MS) {
        updateJob(job.key, {
          status: "error",
          error:
            "Модуль так и не появился. Проверьте курс позже или запустите генерацию заново.",
        });
      }
      return;
    }
    moduleId = created.id as string;
  }

  const module = await getModuleBasicInfo(moduleId as string);
  const lessonsCount = (module?.lessons || []).length;
  const changed = lessonsCount !== job.lessonsCount || !job.resultId;
  forgetCourseCache(job.courseId, [moduleId as string]);
  onModule?.(job.courseId, module);

  const lastChangeAt = changed ? new Date().toISOString() : job.lastChangeAt;
  const isStable =
    lessonsCount > 0 && elapsedSince(lastChangeAt) >= MODULE_STABLE_MS;
  const isTimedOut = elapsedSince(job.startedAt) > JOB_TIMEOUT_MS;
  updateJob(job.key, {
    resultId: moduleId,
    resultTitle: module?.title || "",
    lessonsCount,
    lastChangeAt,
    status: isStable || isTimedOut ? "done" : "running",
  });
}

async function checkLessonJob(
  job: GenerationJob,
  { updateJob, onLesson }: { updateJob: UpdateJob; onLesson?: OnLesson },
): Promise<void> {
  const moduleId = job.moduleId as string;
  const module = await getModuleBasicInfo(moduleId);
  const created = pickNewItem(module?.lessons, job.knownIds, job.order);
  if (!created) {
    if (elapsedSince(job.startedAt) > JOB_TIMEOUT_MS) {
      updateJob(job.key, {
        status: "error",
        error:
          "Урок так и не появился. Проверьте модуль позже или запустите генерацию заново.",
      });
    }
    return;
  }
  const createdId = created.id as string;
  const lesson = await getLessonBasicInfo(createdId).catch(() => created);
  forgetCourseCache(job.courseId, [moduleId], [createdId]);
  onLesson?.(job.courseId, moduleId, lesson);
  updateJob(job.key, {
    resultId: createdId,
    resultTitle: lesson?.title || created.title || "",
    status: "done",
  });
}

/**
 * Следит за запущенными генерациями модулей и уроков и передаёт созданные данные
 * в интерфейс через onModule / onLesson. Подключается один раз в приложении.
 */
export function useGenerationJobsWatcher({
  enabled = true,
  onModule,
  onLesson,
  onDone,
}: GenerationJobsWatcherOptions): void {
  const callbacksRef = useRef({ onModule, onLesson, onDone });
  callbacksRef.current = { onModule, onLesson, onDone };
  const hasRunningJobs = useGenerationJobsStore((state) =>
    Object.values(state.jobs).some((job) => job.status === "running"),
  );

  useEffect(() => {
    if (!enabled || !hasRunningJobs) return undefined;
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      const store = useGenerationJobsStore.getState();
      const running = Object.values(store.jobs).filter(
        (job) => job.status === "running",
      );
      for (const job of running) {
        if (cancelled) break;
        const before = job.status;
        try {
          if (job.kind === "module") {
            // eslint-disable-next-line no-await-in-loop
            await checkModuleJob(job, {
              updateJob: store.updateJob,
              onModule: callbacksRef.current.onModule,
            });
          } else if (job.kind === "lesson") {
            // eslint-disable-next-line no-await-in-loop
            await checkLessonJob(job, {
              updateJob: store.updateJob,
              onLesson: callbacksRef.current.onLesson,
            });
          }
        } catch (error) {
          // Сетевые сбои не прерывают ожидание: проверим ещё раз на следующем шаге.
          const status = Number((error as { status?: unknown } | null)?.status);
          if (status === 403 || status === 404) {
            store.updateJob(job.key, {
              status: "error",
              error:
                "Нет доступа к курсу или модулю, генерацию отследить нельзя.",
            });
          }
        }
        const after = useGenerationJobsStore.getState().jobs[job.key];
        if (before === "running" && after && after.status !== "running") {
          callbacksRef.current.onDone?.(after);
        }
      }
      inFlight = false;
    };

    tick();
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, hasRunningJobs]);
}
