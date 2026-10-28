import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCourseLearningStructure,
  type LearningCourse,
} from "@/entities/course";
import {
  PROGRESS_STATUS,
  ensureCourseProgress,
  ensureLessonProgress,
  getLessonProgress,
  getLessonProgressStatus,
  getLessonsProgress,
  markLessonTheoryCompleted,
  syncCourseProgressPercent,
  type CourseProgress,
  type LessonProgress,
} from "@/entities/progress";

type LessonProgressById = Record<string, LessonProgress | null>;

interface CourseProgressState {
  isLoading: boolean;
  error: string;
  courseProgress: CourseProgress | null;
  lessonProgressById: LessonProgressById;
  lessonIds: string[];
  structure: LearningCourse | null;
}

/** Поле, которое должно появиться после проверки практики или теста. */
export type LessonCompletionField = "practiceCompletedAt" | "testCompletedAt";

// Практика и тест отмечаются на backend событием после проверки (асинхронно),
// поэтому после проверки несколько раз перечитываем прогресс урока.
const REFRESH_DELAYS_MS = [800, 1500, 3000, 5000, 8000];

const EMPTY_STATE: CourseProgressState = {
  isLoading: false,
  error: "",
  courseProgress: null,
  lessonProgressById: {},
  lessonIds: [],
  structure: null,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectLessonIds(course: LearningCourse | null | undefined): string[] {
  return (course?.blocks || []).flatMap((block) =>
    (block.lessons || []).map((lesson) => lesson.id).filter(Boolean),
  );
}

/**
 * Прогресс текущего ученика по курсу: создаёт записи прогресса курса/модуля/урока
 * при прохождении, загружает статусы уроков для дерева и процент прохождения.
 */
export function useCourseProgress(
  courseId: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const [state, setState] = useState<CourseProgressState>(EMPTY_STATE);
  const activeCourseIdRef = useRef<string | null>(null);
  const lessonIdsRef = useRef<string[]>([]);
  const lessonProgressRef = useRef<LessonProgressById>({});
  const theoryRequestsRef = useRef(new Set<string>());
  const refreshTokensRef = useRef<Record<string, symbol>>({});

  const isActive = useCallback(
    (targetCourseId: string) => activeCourseIdRef.current === targetCourseId,
    [],
  );

  const setLessonProgress = useCallback(
    (lessonId: string, progress: LessonProgress | null) => {
      lessonProgressRef.current = {
        ...lessonProgressRef.current,
        [lessonId]: progress,
      };
      setState((current) => ({
        ...current,
        lessonProgressById: {
          ...current.lessonProgressById,
          [lessonId]: progress,
        },
      }));
    },
    [],
  );

  const syncPercent = useCallback(
    async (targetCourseId: string) => {
      const total = lessonIdsRef.current.length;
      if (!total) return;
      try {
        const courseProgress = await syncCourseProgressPercent(
          targetCourseId,
          total,
        );
        if (isActive(targetCourseId) && courseProgress) {
          setState((current) => ({ ...current, courseProgress }));
        }
      } catch {
        // Процент — вторичная информация: статусы уроков уже отрисованы.
      }
    },
    [isActive],
  );

  useEffect(() => {
    activeCourseIdRef.current = enabled && courseId ? courseId : null;
    lessonIdsRef.current = [];
    lessonProgressRef.current = {};
    theoryRequestsRef.current = new Set();
    refreshTokensRef.current = {};

    if (!enabled || !courseId) {
      setState(EMPTY_STATE);
      return undefined;
    }

    const controller = new AbortController();
    setState({ ...EMPTY_STATE, isLoading: true });

    const targetCourseId = courseId;

    async function load() {
      try {
        const [structure, courseProgress] = await Promise.all([
          getCourseLearningStructure(targetCourseId),
          ensureCourseProgress(targetCourseId),
        ]);
        const lessonIds = collectLessonIds(structure);
        const lessonProgressById = await getLessonsProgress(lessonIds, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || !isActive(targetCourseId)) return;

        lessonIdsRef.current = lessonIds;
        lessonProgressRef.current = {
          ...lessonProgressById,
          ...lessonProgressRef.current,
        };
        setState({
          isLoading: false,
          error: "",
          courseProgress,
          lessonProgressById: lessonProgressRef.current,
          lessonIds,
          structure,
        });
        // Практика/тест могли закрыться событием, пока страница была закрыта, —
        // пересчитываем сохранённый процент курса.
        syncPercent(targetCourseId);
      } catch (rawError) {
        if (controller.signal.aborted || !isActive(targetCourseId)) return;
        const error = rawError as {
          userMessage?: string;
          message?: string;
        } | null;
        setState((current) => ({
          ...current,
          isLoading: false,
          error:
            error?.userMessage ||
            error?.message ||
            "Не удалось загрузить прогресс курса.",
        }));
      }
    }

    load();

    return () => {
      controller.abort();
    };
  }, [courseId, enabled, isActive, syncPercent]);

  const trackLesson = useCallback(
    async (moduleId: string, lessonId: string) => {
      const targetCourseId = activeCourseIdRef.current;
      if (!targetCourseId || !moduleId || !lessonId) return null;
      if (lessonProgressRef.current[lessonId]) {
        return lessonProgressRef.current[lessonId];
      }
      try {
        const progress = await ensureLessonProgress(
          targetCourseId,
          moduleId,
          lessonId,
        );
        if (isActive(targetCourseId) && progress) {
          setLessonProgress(lessonId, progress);
        }
        return progress;
      } catch {
        return null;
      }
    },
    [isActive, setLessonProgress],
  );

  const completeTheory = useCallback(
    async (moduleId: string, lessonId: string) => {
      const targetCourseId = activeCourseIdRef.current;
      if (!targetCourseId || !lessonId) return;
      if (lessonProgressRef.current[lessonId]?.theoryCompletedAt) return;
      if (theoryRequestsRef.current.has(lessonId)) return;
      theoryRequestsRef.current.add(lessonId);

      try {
        await trackLesson(moduleId, lessonId);
        const progress = await markLessonTheoryCompleted(lessonId);
        if (!isActive(targetCourseId) || !progress) return;
        setLessonProgress(lessonId, progress);
        if (getLessonProgressStatus(progress) === PROGRESS_STATUS.COMPLETED) {
          syncPercent(targetCourseId);
        }
      } catch {
        // Не получилось — дадим ещё одну попытку при следующей прокрутке до конца.
        theoryRequestsRef.current.delete(lessonId);
      }
    },
    [isActive, setLessonProgress, syncPercent, trackLesson],
  );

  // field: "practiceCompletedAt" | "testCompletedAt" — что должно появиться после проверки.
  const refreshLesson = useCallback(
    async (lessonId: string, field?: LessonCompletionField) => {
      const targetCourseId = activeCourseIdRef.current;
      if (!targetCourseId || !lessonId) return;
      const token = Symbol(lessonId);
      refreshTokensRef.current[lessonId] = token;

      for (const delay of REFRESH_DELAYS_MS) {
        await wait(delay);
        if (
          !isActive(targetCourseId) ||
          refreshTokensRef.current[lessonId] !== token
        ) {
          return;
        }
        try {
          const progress = await getLessonProgress(lessonId);
          if (!isActive(targetCourseId)) return;
          if (progress) setLessonProgress(lessonId, progress);
          if (!field || progress?.[field]) break;
        } catch {
          // Пробуем ещё раз со следующей задержкой.
        }
      }
      syncPercent(targetCourseId);
    },
    [isActive, setLessonProgress, syncPercent],
  );

  const summary = useMemo(() => {
    const total = state.lessonIds.length;
    const completed = state.lessonIds.filter(
      (lessonId) =>
        getLessonProgressStatus(state.lessonProgressById[lessonId]) ===
        PROGRESS_STATUS.COMPLETED,
    ).length;
    const started = state.lessonIds.filter(
      (lessonId) =>
        getLessonProgressStatus(state.lessonProgressById[lessonId]) !==
        PROGRESS_STATUS.NOT_STARTED,
    ).length;
    const percent = state.courseProgress
      ? state.courseProgress.percent
      : total
        ? (completed * 100) / total
        : 0;
    return { total, completed, started, percent: Math.round(percent) };
  }, [state.courseProgress, state.lessonIds, state.lessonProgressById]);

  return {
    isEnabled: Boolean(enabled && courseId),
    isLoading: state.isLoading,
    error: state.error,
    lessonProgressById: state.lessonProgressById,
    // Полная структура курса (модули с уроками), по которой считается прогресс.
    structure: state.structure,
    summary,
    trackLesson,
    completeTheory,
    refreshLesson,
  };
}
