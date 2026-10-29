import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LessonPracticeAgent,
  LessonTestAgent,
} from "@/features/lesson-assessment";
import { LessonChatWorkspace } from "@/widgets/lesson-chat-workspace";
import {
  CourseNavigationTree,
  getCachedCourseBasicInfo as getCourseBasicInfo,
  getCourseLearningStructure,
  getLessonById,
  getLessonContentBlocks,
  getModuleById,
  useStudentStore,
  ContentBlocks,
  CourseBasicInfo,
  LessonBasicInfo,
  LessonList,
  ModuleBasicInfo,
  ModuleList,
  type ContentBlock,
  type LearningCourse,
} from "@/entities/course";
import { SectionTop } from "@/shared/ui/section-top";
import { CourseInviteDialog } from "@/features/invite";
import type { AssessmentResult } from "@/features/lesson-assessment";
import {
  COURSE_PERMISSIONS,
  usePermissionStore,
  useSessionStore,
} from "@/entities/session";
import { useUiLayoutStore } from "@/shared/lib/ui-layout";
import { useTheorySessionTracker } from "@/features/track-theory-time";
import { useCourseProgress } from "@/features/course-progress";
import { getModuleProgressSummary } from "@/entities/progress";
import { getErrorMessage } from "@/shared/lib/errors";
import { isUuid } from "@/shared/lib/uuid";
import { isTokenExpired } from "@/shared/api";
import {
  CourseMetricsSummary,
  LessonMetricsDashboard,
  useCourseMetricsStore,
} from "@/widgets/course-metrics";
import "@/entities/course/ui/course-viewer.css";
import {
  NO_SELECTED_BLOCK,
  errorText,
  findBlockByLesson,
  getCourseCreatorId,
  getCourseStudents,
  mergeCourseLessons,
  toLessonBasicInfoFromLearningLesson,
  toModuleBasicInfoFromLearningBlock,
} from "../lib/course-view";
import { CourseProgressBar } from "./CourseProgressBar";
import { LessonPartMark } from "./LessonPartMark";

export interface CourseViewerProps {
  /** Курс из локального черновика (не UUID), открытый без запроса к бэкенду. */
  localCourse?: LearningCourse | null;
  mode?: "view" | "metrics";
}

/** Просмотр курса учеником и метрики курса для автора. */
export function CourseViewer({
  localCourse = null,
  mode = "view",
}: CourseViewerProps) {
  const { courseId, blockId, lessonId } = useParams();
  const navigate = useNavigate();
  const accessToken = useSessionStore((state) => state.accessToken);
  const refreshToken = useSessionStore((state) => state.refreshToken);
  const expiresAt = useSessionStore((state) => state.expiresAt);
  const identity = useSessionStore((state) => state.identity);
  const user = useSessionStore((state) => state.user);
  const isAuthenticated = Boolean(
    accessToken && expiresAt && (!isTokenExpired(expiresAt) || refreshToken),
  );
  const hasCourseInfoPermission = usePermissionStore((state) =>
    state.hasAnyPermission([
      COURSE_PERMISSIONS.READ,
      COURSE_PERMISSIONS.COURSE_READ,
    ]),
  );
  const canViewCourseInfo = !isAuthenticated || hasCourseInfoPermission;
  const canReadCourseContent = usePermissionStore((state) =>
    state.hasPermission(COURSE_PERMISSIONS.COURSE_READ),
  );
  const canUpdateCourse = usePermissionStore((state) =>
    state.hasPermission(COURSE_PERMISSIONS.UPDATE),
  );
  const [course, setCourse] = useState<LearningCourse | null>(null);
  const loadedCourseIdRef = useRef<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(
    blockId ?? null,
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(
    lessonId ?? null,
  );
  const [isLearningStarted, setIsLearningStarted] = useState(
    Boolean(blockId || lessonId),
  );
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
  const [contentLessonId, setContentLessonId] = useState<string | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState("");
  const theoryContainerRef = useRef<HTMLElement>(null);
  const theoryContentRef = useRef<HTMLElement>(null);
  const [isLoadingCourse, setIsLoadingCourse] = useState(true);
  const [isLoadingLesson, setIsLoadingLesson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveCourseId = courseId || "";
  const isMetricsMode = mode === "metrics";
  const signCourse = useStudentStore((state) => state.signCourse);
  const loadMyCourses = useStudentStore((state) => state.loadMyCourses);
  const isCourseEnrolled = useStudentStore((state) => state.isCourseEnrolled);
  const isCourseSigning = useStudentStore((state) =>
    state.isCourseSigning(course?.id || effectiveCourseId),
  );
  const rawCurrentUserId =
    identity?.id ||
    identity?.user_id ||
    identity?.userId ||
    user?.id ||
    user?.user_id;
  const currentUserId = rawCurrentUserId ? String(rawCurrentUserId) : undefined;
  const courseCreatorId = getCourseCreatorId(course);
  const isOwnCourse = Boolean(
    currentUserId && courseCreatorId && currentUserId === courseCreatorId,
  );
  const canViewWithoutEnrollment = isOwnCourse;
  const canInviteToCourse = isOwnCourse || canUpdateCourse;
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const inviteControls = canInviteToCourse ? (
    <>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setIsInviteOpen(true)}
      >
        Пригласить
      </button>
      <CourseInviteDialog
        open={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        courseId={course?.id || effectiveCourseId}
        courseTitle={course?.title}
        canViewMembers={canUpdateCourse}
        currentUserId={currentUserId}
      />
    </>
  ) : null;
  const canNavigateCourseContent = isMetricsMode
    ? canUpdateCourse
    : canReadCourseContent;

  const selectedBlock = useMemo(() => {
    if (!course) {
      return null;
    }

    return (
      course.blocks.find((block) => block.id === selectedModuleId) ??
      findBlockByLesson(course, selectedLessonId) ??
      null
    );
  }, [course, selectedLessonId, selectedModuleId]);

  const selectedLesson = useMemo(() => {
    if (!selectedBlock || !selectedLessonId) {
      return null;
    }

    return (
      selectedBlock.lessons.find((lesson) => lesson.id === selectedLessonId) ??
      null
    );
  }, [selectedBlock, selectedLessonId]);

  const moduleBasicInfo = useMemo(
    () => toModuleBasicInfoFromLearningBlock(selectedBlock),
    [selectedBlock],
  );

  const lessonBasicInfo = useMemo(
    () => toLessonBasicInfoFromLearningLesson(selectedLesson),
    [selectedLesson],
  );

  const activeTab = useUiLayoutStore((state) =>
    state.getLessonActiveTab(selectedLesson?.id ?? ""),
  );
  const setLessonActiveTab = useUiLayoutStore(
    (state) => state.setLessonActiveTab,
  );

  const shouldTrackTheorySession =
    mode === "view" &&
    canReadCourseContent &&
    (isEnrolled || isOwnCourse) &&
    activeTab === "theory";

  // Прогресс ведём только для записанного на курс ученика.
  const isProgressTracked =
    mode === "view" &&
    canReadCourseContent &&
    isEnrolled &&
    isUuid(course?.id || "");
  const {
    lessonProgressById,
    structure: progressStructure,
    summary: progressSummary,
    trackLesson,
    completeTheory,
    refreshLesson,
  } = useCourseProgress(course?.id, { enabled: isProgressTracked });
  const selectedLessonProgress = selectedLesson
    ? lessonProgressById[selectedLesson.id]
    : null;
  const moduleProgressById = useMemo(() => {
    if (!isProgressTracked || !course) {
      return null;
    }
    return Object.fromEntries(
      course.blocks.map((block) => [
        block.id,
        getModuleProgressSummary(block, lessonProgressById),
      ]),
    );
  }, [course, isProgressTracked, lessonProgressById]);

  useTheorySessionTracker(selectedLesson?.id, {
    enabled: shouldTrackTheorySession,
    scrollContainerRef: theoryContainerRef,
    contentRef: theoryContentRef,
    // При смене адреса курс перезагружается и теория монтируется заново —
    // учитываем это, иначе трекер держит ссылку на уже снятый DOM-узел.
    isContentReady: !isLoadingCourse && !isLoadingLesson && !error,
    // Теория засчитывается автоматически, когда ученик долистал её до конца.
    onReachEnd: isProgressTracked
      ? (reachedLessonId) =>
          completeTheory(
            findBlockByLesson(course, reachedLessonId)?.id ||
              selectedBlock?.id ||
              "",
            reachedLessonId,
          )
      : null,
    canReachEnd:
      !isLoadingLesson &&
      Boolean(selectedLesson?.id) &&
      contentLessonId === selectedLesson?.id,
  });

  useEffect(() => {
    if (progressStructure && course) {
      // mergeCourseLessons возвращает тот же объект, если подставлять нечего.
      setCourse((currentCourse) =>
        mergeCourseLessons(currentCourse, progressStructure),
      );
    }
  }, [course, progressStructure]);

  useEffect(() => {
    if (isProgressTracked && selectedBlock?.id && selectedLesson?.id) {
      trackLesson(selectedBlock.id, selectedLesson.id);
    }
  }, [isProgressTracked, selectedBlock?.id, selectedLesson?.id, trackLesson]);

  const handleAssessmentChecked =
    (field: "testCompletedAt" | "practiceCompletedAt") =>
    (result: AssessmentResult) => {
      if (
        isProgressTracked &&
        selectedLesson?.id &&
        result?.is_passed !== false
      ) {
        refreshLesson(selectedLesson.id, field);
      }
    };

  useEffect(() => {
    let isMounted = true;

    async function loadCourse() {
      // При переходе по урокам того же курса не показываем полноэкранную загрузку:
      // иначе дерево и теория пересоздаются, а дерево прыгает в начало.
      const isSameCourse = loadedCourseIdRef.current === effectiveCourseId;
      if (!isSameCourse) {
        setIsLoadingCourse(true);
      }
      setError(null);

      try {
        if (!effectiveCourseId) {
          throw new Error("Идентификатор курса не указан");
        }

        // Прямая ссылка или обновление страницы на модуле/уроке: в краткой информации
        // о курсе уроков нет, поэтому догружаем структуру, иначе урок из адреса
        // не находится и вместо него открывается обзор курса.
        const isDeepLink =
          isUuid(effectiveCourseId) && Boolean(blockId || lessonId);
        let basicCourse =
          isMetricsMode || isDeepLink
            ? await getCourseLearningStructure(effectiveCourseId)
            : !isUuid(effectiveCourseId) &&
                localCourse?.id === effectiveCourseId
              ? localCourse
              : await getCourseBasicInfo(effectiveCourseId);

        if (!isMetricsMode && isDeepLink && lessonId && isUuid(lessonId)) {
          await getLessonById(lessonId).catch(() => null);
          basicCourse = await getCourseBasicInfo(effectiveCourseId);
        }

        if (!isMetricsMode && canReadCourseContent) {
          await loadMyCourses({ page: 1, size: 100 }).catch(() => null);
        }

        const enrolled = canReadCourseContent
          ? useStudentStore.getState().isCourseEnrolled(basicCourse.id) ||
            getCourseStudents(basicCourse).some(
              (student) => student?.course_id === basicCourse.id,
            )
          : false;

        if (!isMounted) {
          return;
        }

        loadedCourseIdRef.current = effectiveCourseId;
        setCourse(basicCourse);
        setIsEnrolled(enrolled);
        setSelectedModuleId(blockId ?? null);
        setSelectedLessonId(lessonId ?? null);
        setIsLearningStarted(
          isMetricsMode ||
            (Boolean(blockId || lessonId) && canReadCourseContent),
        );
      } catch (loadError) {
        if (isMounted) {
          setError(errorText(loadError, "Не удалось загрузить курс"));
        }
      } finally {
        if (isMounted) {
          setIsLoadingCourse(false);
        }
      }
    }

    loadCourse();

    return () => {
      isMounted = false;
    };
  }, [
    blockId,
    canReadCourseContent,
    effectiveCourseId,
    isMetricsMode,
    lessonId,
    loadMyCourses,
    localCourse,
  ]);

  useEffect(() => {
    if (isMetricsMode || !canReadCourseContent || !selectedLesson?.id) {
      setContentBlocks([]);
      setContentLessonId(null);
      return;
    }

    let isMounted = true;
    const contentLessonIdToLoad = selectedLesson.id;

    async function loadLessonContent() {
      setIsLoadingLesson(true);
      setContentLessonId(null);
      setError(null);

      try {
        const lessonBlocks = await getLessonContentBlocks(
          contentLessonIdToLoad,
        );

        if (isMounted) {
          setContentBlocks(lessonBlocks);
          setContentLessonId(contentLessonIdToLoad);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(errorText(loadError, "Не удалось загрузить теорию урока"));
        }
      } finally {
        if (isMounted) {
          setIsLoadingLesson(false);
        }
      }
    }

    loadLessonContent();

    return () => {
      isMounted = false;
    };
  }, [canReadCourseContent, isMetricsMode, selectedLesson?.id]);

  const openCourseOverview = () => {
    if (!canNavigateCourseContent || !course) {
      return;
    }

    setIsLearningStarted(true);
    setSelectedModuleId(null);
    setSelectedLessonId(null);
    navigate(
      isMetricsMode ? `/course/${course.id}/metrics` : `/course/${course.id}`,
    );
  };

  const startLearning = () => {
    if (!canReadCourseContent) {
      return;
    }

    setIsLearningStarted(true);
    setSelectedModuleId(null);
    setSelectedLessonId(null);
  };

  const openBlock = async (blockId: string) => {
    if (!canNavigateCourseContent || !course) {
      return;
    }

    const fallbackBlock = course?.blocks.find((block) => block.id === blockId);
    setSelectedModuleId(blockId);
    setSelectedLessonId(null);
    setContentBlocks([]);
    setError(null);

    try {
      const nextBlock = isUuid(blockId)
        ? await getModuleById(blockId)
        : fallbackBlock;
      if (!nextBlock) {
        throw new Error("Модуль не найден");
      }
      setCourse((currentCourse) => {
        if (!currentCourse) return currentCourse;
        return {
          ...currentCourse,
          blocks: currentCourse.blocks.map((block) =>
            block.id === nextBlock.id ? { ...block, ...nextBlock } : block,
          ),
        };
      });
      navigate(
        isMetricsMode
          ? `/course/${course.id}/metrics`
          : `/course/${course.id}/block/${nextBlock.id || blockId}`,
      );
    } catch (loadError) {
      setSelectedModuleId(fallbackBlock?.id ?? null);
      setError(errorText(loadError, "Не удалось загрузить модуль"));
    }
  };

  const openLesson = async (nextLessonId: string) => {
    if (!canNavigateCourseContent || !course) {
      return;
    }

    const fallbackBlock = findBlockByLesson(course, nextLessonId);
    setSelectedModuleId(fallbackBlock?.id ?? selectedModuleId);
    setSelectedLessonId(nextLessonId);
    setContentBlocks([]);
    setError(null);

    try {
      const fallbackLesson = fallbackBlock?.lessons.find(
        (lesson) => lesson.id === nextLessonId,
      );
      const nextLesson = isUuid(nextLessonId)
        ? await getLessonById(nextLessonId)
        : fallbackLesson;
      if (!nextLesson) {
        throw new Error("Урок не найден");
      }
      setCourse((currentCourse) => {
        if (!currentCourse) return currentCourse;
        return {
          ...currentCourse,
          blocks: currentCourse.blocks.map((block) => ({
            ...block,
            lessons: block.lessons.map((lesson) =>
              lesson.id === nextLesson.id
                ? { ...lesson, ...nextLesson }
                : lesson,
            ),
          })),
        };
      });
      navigate(
        isMetricsMode
          ? `/course/${course.id}/metrics/lessons/${nextLessonId}`
          : `/course/${course.id}/lesson/${nextLessonId}`,
      );
    } catch (loadError) {
      setError(errorText(loadError, "Не удалось загрузить урок"));
    }
  };

  // Из сводки: выбираем студента и открываем метрики первого урока курса.
  const openStudentMetrics = (userId: string) => {
    useCourseMetricsStore.getState().setSelectedStudent(userId);
    const firstLesson = (course?.blocks || []).flatMap(
      (block) => block.lessons || [],
    )[0];
    if (firstLesson) openLesson(firstLesson.id);
  };

  const openCourseEditor = () => {
    if (course?.id && canUpdateCourse) {
      navigate(`/course/${course.id}/edit`);
    }
  };

  const openCourseMetrics = () => {
    if (course?.id && canUpdateCourse) {
      navigate(`/course/${course.id}/metrics`);
    }
  };

  const enrollToCourse = async () => {
    if (!course?.id || isCourseSigning) {
      return;
    }

    setEnrollmentError("");
    try {
      const student = await signCourse(course.id);
      setCourse((currentCourse) =>
        currentCourse
          ? {
              ...currentCourse,
              students: [...getCourseStudents(currentCourse), student],
            }
          : currentCourse,
      );
      setIsEnrolled(true);
      setIsLearningStarted(true);
    } catch (error) {
      setEnrollmentError(
        getErrorMessage(error, "Не удалось записаться на курс.") ?? "",
      );
    }
  };

  if (!canViewCourseInfo && !isMetricsMode) {
    return (
      <section className="container section course-viewer">
        <SectionTop label="Курс" title="Доступ ограничен" />
        <article className="glass-card course-viewer-error">
          Курс недоступен для вашей роли. Обратитесь к администратору
          организации, чтобы получить доступ.
        </article>
      </section>
    );
  }

  if (isLoadingCourse) {
    return (
      <section className="container section course-viewer">
        <article className="glass-card course-viewer-loading-card">
          <p className="course-viewer-muted">Загружаем курс...</p>
        </article>
      </section>
    );
  }

  if (error && !course) {
    return (
      <section className="container section course-viewer">
        <article className="glass-card course-viewer-error">
          <h1>Не удалось открыть курс</h1>
          <p>{error}</p>
        </article>
      </section>
    );
  }

  // После загрузки курс есть всегда: иначе выше показана ошибка.
  if (!course) {
    return null;
  }

  if (isMetricsMode && !canUpdateCourse) {
    return (
      <section className="container section course-viewer course-enrollment-view">
        <SectionTop label="Метрики курса" title="Доступ ограничен" />
        <article className="glass-card course-viewer-error">
          Для просмотра метрик нужны права управления курсом.
        </article>
      </section>
    );
  }

  if (!isMetricsMode && !canReadCourseContent) {
    return (
      <section className="container section course-viewer course-enrollment-view">
        <SectionTop label="Курс" title={course?.title || "Просмотр курса"} />
        {error && (
          <article className="glass-card course-viewer-error" role="alert">
            {error}
          </article>
        )}
        <CourseBasicInfo course={course} />
        <article className="glass-card locked-course-card generated-course-enroll-card">
          <div>
            <h2>Прохождение курса недоступно</h2>
            <p>
              {isAuthenticated
                ? "Вы можете смотреть информацию о курсе, но для открытия модулей, уроков, теории, практики и ИИ-ментора нужны дополнительные права."
                : "Вы можете смотреть информацию о курсе без авторизации. Войдите, чтобы получить доступ к прохождению курса."}
            </p>
          </div>
          {(!isAuthenticated || canUpdateCourse) && (
            <div className="generated-course-actions">
              {!isAuthenticated && (
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() =>
                    navigate(
                      `/login?redirect=${encodeURIComponent(`/course/${course.id}`)}`,
                    )
                  }
                >
                  Войти
                </button>
              )}
              {canUpdateCourse && (
                <>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={openCourseEditor}
                  >
                    Редактировать курс
                  </button>
                  <button
                    type="button"
                    className="btn btn-solid"
                    onClick={openCourseMetrics}
                  >
                    Посмотреть метрики
                  </button>
                </>
              )}
            </div>
          )}
        </article>
      </section>
    );
  }

  if (!isMetricsMode && !isEnrolled && !canViewWithoutEnrollment) {
    return (
      <section className="container section course-viewer course-enrollment-view">
        <SectionTop label="Курс" title={course?.title || "Просмотр курса"} />
        {error && (
          <article className="glass-card course-viewer-error" role="alert">
            {error}
          </article>
        )}
        <CourseBasicInfo course={course} />
        <article className="glass-card locked-course-card generated-course-enroll-card">
          <div>
            <h2>Содержимое курса закрыто</h2>
            <p>
              Запишитесь на курс, чтобы открыть модули, уроки, теорию, практику
              и ИИ-ментора.
            </p>
          </div>
          <div className="generated-course-actions generated-course-edit-actions">
            <button
              type="button"
              className="btn btn-solid"
              onClick={enrollToCourse}
              disabled={isCourseSigning}
            >
              {isCourseSigning ? "Записываем..." : "Записаться на курс"}
            </button>
            {canUpdateCourse && (
              <>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={openCourseEditor}
                >
                  Редактировать курс
                </button>
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={openCourseMetrics}
                >
                  Посмотреть метрики
                </button>
              </>
            )}
            {inviteControls}
          </div>
          {enrollmentError && (
            <p className="lesson-ai-error" role="alert">
              {enrollmentError}
            </p>
          )}
        </article>
      </section>
    );
  }

  if (!isMetricsMode && !isLearningStarted) {
    return (
      <section className="container section course-viewer course-enrollment-view">
        <SectionTop label="Курс" title={course?.title || "Просмотр курса"} />
        {error && (
          <article className="glass-card course-viewer-error" role="alert">
            {error}
          </article>
        )}
        <CourseBasicInfo course={course} />
        <article className="glass-card generated-course-enroll-card">
          <div>
            <h2>
              {canViewWithoutEnrollment
                ? "Курс доступен для просмотра"
                : "Курс доступен для прохождения"}
            </h2>
            <p>
              {canViewWithoutEnrollment
                ? "Нажмите кнопку, чтобы открыть структуру курса для чтения."
                : "Нажмите кнопку, чтобы открыть структуру курса и начать обучение."}
            </p>
            {isProgressTracked && progressSummary.total > 0 && (
              <CourseProgressBar summary={progressSummary} />
            )}
          </div>
          <div className="generated-course-actions">
            <button
              type="button"
              className="btn btn-solid"
              onClick={startLearning}
            >
              {canViewWithoutEnrollment
                ? "Посмотреть теорию"
                : isProgressTracked && progressSummary.started > 0
                  ? "Продолжить обучение"
                  : "Перейти к обучению"}
            </button>
            {canUpdateCourse && (
              <>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={openCourseEditor}
                >
                  Редактировать курс
                </button>
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={openCourseMetrics}
                >
                  Посмотреть метрики
                </button>
              </>
            )}
            {inviteControls}
          </div>
        </article>
      </section>
    );
  }

  const sectionLabel = isMetricsMode
    ? "Метрики курса"
    : selectedLesson
      ? "Урок"
      : selectedBlock
        ? "Модуль"
        : "Курс";
  const sectionTitle = isMetricsMode
    ? selectedLesson?.title || selectedBlock?.title || course.title
    : selectedLesson?.title || selectedBlock?.title || course.title;
  const isLessonChatEnabled =
    !isMetricsMode && canReadCourseContent && Boolean(selectedLesson);
  const isChatAvailable = isLessonChatEnabled && activeTab === "theory";

  return (
    <section className="container section lesson-view generated-course-learning-view">
      <SectionTop label={sectionLabel} title={sectionTitle} />
      {error && (
        <article className="glass-card course-viewer-error" role="alert">
          {error}
        </article>
      )}
      <LessonChatWorkspace
        className="generated-course-learning-grid"
        chatEnabled={isLessonChatEnabled}
        chatAvailable={isChatAvailable}
        chatKey={selectedLesson?.id || "no-lesson"}
        chatProps={{
          courseId: course.id,
          lessonId: selectedLesson?.id,
          lessonTitle: selectedLesson?.title,
          contentBlocks,
        }}
      >
        {course.blocks.length > 0 ? (
          <CourseNavigationTree
            selectedCourse={course}
            selectedBlock={
              isMetricsMode && !selectedLesson
                ? NO_SELECTED_BLOCK
                : selectedBlock || course.blocks[0]
            }
            selectedLessonId={selectedLesson?.id || ""}
            summaryItem={
              isMetricsMode
                ? {
                    label: "Сводка по курсу",
                    active: !selectedLesson,
                    onOpen: openCourseOverview,
                  }
                : null
            }
            selectedPracticeId=""
            completedLessons={{}}
            completedPractices={{}}
            openBlock={openBlock}
            openLesson={openLesson}
            openPractice={() => {}}
            mode={isMetricsMode ? "metrics" : "theory"}
            lessonProgressById={isProgressTracked ? lessonProgressById : null}
            progressSummary={progressSummary}
          />
        ) : (
          <aside className="course-nav-tree generated-course-navigation-shell">
            <p className="course-viewer-muted">В курсе пока нет модулей.</p>
          </aside>
        )}

        <article
          ref={theoryContainerRef}
          className="glass-card lesson-main-card generated-course-main-card"
          onScroll={(event) => {
            event.currentTarget.classList.toggle(
              "is-scrolled",
              event.currentTarget.scrollTop > 8,
            );
          }}
        >
          <div className="lesson-scroll-frame generated-course-scroll-frame">
            {isMetricsMode ? (
              selectedLesson ? (
                <LessonMetricsDashboard
                  courseId={course.id}
                  lesson={selectedLesson}
                />
              ) : (
                <CourseMetricsSummary
                  courseId={course.id}
                  onOpenStudent={openStudentMetrics}
                />
              )
            ) : !selectedBlock ? (
              <>
                <CourseBasicInfo course={course} />
                <ModuleList
                  modules={course.blocks}
                  selectedModuleId=""
                  disabled={false}
                  onSelectModule={openBlock}
                  progressById={moduleProgressById}
                />
              </>
            ) : !selectedLesson ? (
              <>
                <ModuleBasicInfo module={moduleBasicInfo} />
                <LessonList
                  lessons={moduleBasicInfo?.lessons || []}
                  selectedLessonId=""
                  onSelectLesson={openLesson}
                  progressById={isProgressTracked ? lessonProgressById : null}
                />
              </>
            ) : (
              <>
                <div
                  className="lesson-mode-switch"
                  role="tablist"
                  aria-label="Тип материала"
                >
                  <button
                    type="button"
                    className={activeTab === "theory" ? "is-active" : ""}
                    aria-selected={activeTab === "theory"}
                    onClick={() =>
                      setLessonActiveTab(selectedLesson.id, "theory")
                    }
                  >
                    Теория
                    {isProgressTracked && (
                      <LessonPartMark
                        done={Boolean(
                          selectedLessonProgress?.theoryCompletedAt,
                        )}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    className={activeTab === "questions" ? "is-active" : ""}
                    aria-selected={activeTab === "questions"}
                    onClick={() =>
                      setLessonActiveTab(selectedLesson.id, "questions")
                    }
                  >
                    Проверочные вопросы
                    {isProgressTracked && (
                      <LessonPartMark
                        done={Boolean(selectedLessonProgress?.testCompletedAt)}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    className={activeTab === "practice" ? "is-active" : ""}
                    aria-selected={activeTab === "practice"}
                    onClick={() =>
                      setLessonActiveTab(selectedLesson.id, "practice")
                    }
                  >
                    Практика
                    {isProgressTracked && (
                      <LessonPartMark
                        done={Boolean(
                          selectedLessonProgress?.practiceCompletedAt,
                        )}
                      />
                    )}
                  </button>
                </div>

                {activeTab === "questions" ? (
                  <LessonTestAgent
                    key={`${selectedBlock.id}:${selectedLesson.id}:test`}
                    moduleId={selectedBlock.id}
                    lessonId={selectedLesson.id}
                    onChecked={handleAssessmentChecked("testCompletedAt")}
                  />
                ) : activeTab === "practice" ? (
                  <LessonPracticeAgent
                    key={`${selectedBlock.id}:${selectedLesson.id}:practice`}
                    moduleId={selectedBlock.id}
                    lessonId={selectedLesson.id}
                    onChecked={handleAssessmentChecked("practiceCompletedAt")}
                  />
                ) : (
                  <div className="lesson-theory-content">
                    <p className="course-category">{course.title}</p>
                    <LessonBasicInfo lesson={lessonBasicInfo} />
                    {isLoadingLesson ? (
                      <p className="course-viewer-muted">
                        Загружаем теорию урока...
                      </p>
                    ) : (
                      <ContentBlocks
                        ref={theoryContentRef}
                        blocks={contentBlocks}
                        lessonId={selectedLesson.id}
                        ownerUserId={courseCreatorId || currentUserId}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </article>
      </LessonChatWorkspace>
    </section>
  );
}
