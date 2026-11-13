import { Breadcrumbs } from '@/widgets/breadcrumbs';
import { CollapsedCourseContents } from '@/entities/course';
import { toText } from '@/shared/lib/text';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LessonPracticeAgent,
  LessonTestAgent,
} from '@/features/lesson-assessment';
import { LessonChatWorkspace } from '@/widgets/lesson-chat-workspace';
import {
  CourseNavigationTree,
  formatCourseLevel,
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
  type CourseNode,
  type LearningCourse,
} from '@/entities/course';
import { SectionTop } from '@/shared/ui/section-top';
import { CourseInviteDialog } from '@/features/invite';
import type { AssessmentResult } from '@/features/lesson-assessment';
import {
  COURSE_PERMISSIONS,
  usePermissionStore,
  useSessionStore,
} from '@/entities/session';
import { useUiLayoutStore } from '@/shared/lib/ui-layout';
import { useTheorySessionTracker } from '@/features/track-theory-time';
import { useCourseProgress } from '@/features/course-progress';
import { getModuleProgressSummary } from '@/entities/progress';
import { getErrorMessage } from '@/shared/lib/errors';
import { isUuid } from '@/shared/lib/uuid';
import { isTokenExpired } from '@/shared/api';
import {
  CourseMetricsSummary,
  LessonMetricsDashboard,
  useCourseMetricsStore,
} from '@/widgets/course-metrics';
import {
  NO_SELECTED_BLOCK,
  errorText,
  findBlockByLesson,
  getCourseCreatorId,
  getCourseStudents,
  mergeCourseLessons,
  toLessonBasicInfoFromLearningLesson,
  toModuleBasicInfoFromLearningBlock,
} from '../lib/course-view';
import { CourseProgressBar } from './CourseProgressBar';

export interface CourseViewerProps {
  /** Курс из локального черновика (не UUID), открытый без запроса к бэкенду. */
  localCourse?: CourseNode | null;
  mode?: 'view' | 'metrics';
}

/** Просмотр курса учеником и метрики курса для автора. */
export function CourseViewer({
  localCourse = null,
  mode = 'view',
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
  const [contentsCollapsed, setContentsCollapsed] = useState(false);
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
  const [enrollmentError, setEnrollmentError] = useState('');
  const theoryContainerRef = useRef<HTMLElement>(null);
  const theoryContentRef = useRef<HTMLElement>(null);
  const [isLoadingCourse, setIsLoadingCourse] = useState(true);
  const [isLoadingLesson, setIsLoadingLesson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveCourseId = courseId || '';
  const isMetricsMode = mode === 'metrics';
  const signCourse = useStudentStore((state) => state.signCourse);
  const loadMyCourses = useStudentStore((state) => state.loadMyCourses);

  const isCourseSigning = useStudentStore((state) =>
    state.isCourseSigning(course?.id || effectiveCourseId),
  );
  const rawCurrentUserId =
    identity?.id ||
    identity?.user_id ||
    identity?.userId ||
    user?.id ||
    user?.user_id;
  const currentUserId = rawCurrentUserId ? toText(rawCurrentUserId) : undefined;
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
        className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
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
    state.getLessonActiveTab(selectedLesson?.id ?? ''),
  );
  const setLessonActiveTab = useUiLayoutStore(
    (state) => state.setLessonActiveTab,
  );

  const shouldTrackTheorySession =
    mode === 'view' &&
    canReadCourseContent &&
    (isEnrolled || isOwnCourse) &&
    activeTab === 'theory';

  // Прогресс ведём только для записанного на курс ученика.
  const isProgressTracked =
    mode === 'view' &&
    canReadCourseContent &&
    isEnrolled &&
    isUuid(course?.id || '');
  const {
    lessonProgressById,
    structure: progressStructure,
    summary: progressSummary,
    trackLesson,
    completeTheory,
    refreshLesson,
  } = useCourseProgress(course?.id, { enabled: isProgressTracked });
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
          void completeTheory(
            findBlockByLesson(course, reachedLessonId)?.id ||
              selectedBlock?.id ||
              '',
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
      void trackLesson(selectedBlock.id, selectedLesson.id);
    }
  }, [isProgressTracked, selectedBlock?.id, selectedLesson?.id, trackLesson]);

  const handleAssessmentChecked =
    (field: 'testCompletedAt' | 'practiceCompletedAt') =>
    (result: AssessmentResult) => {
      if (
        isProgressTracked &&
        selectedLesson?.id &&
        result?.is_passed !== false
      ) {
        void refreshLesson(selectedLesson.id, field);
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
          throw new Error('Идентификатор курса не указан');
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
              ? // Локальный черновик курса устроен так же, как курс с бэкенда.
                (localCourse as LearningCourse)
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
          setError(errorText(loadError, 'Не удалось загрузить курс'));
        }
      } finally {
        if (isMounted) {
          setIsLoadingCourse(false);
        }
      }
    }

    void loadCourse();

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
          setError(errorText(loadError, 'Не удалось загрузить теорию урока'));
        }
      } finally {
        if (isMounted) {
          setIsLoadingLesson(false);
        }
      }
    }

    void loadLessonContent();

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
    void navigate(
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
        throw new Error('Модуль не найден');
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
      void navigate(
        isMetricsMode
          ? `/course/${course.id}/metrics`
          : `/course/${course.id}/block/${nextBlock.id || blockId}`,
      );
    } catch (loadError) {
      setSelectedModuleId(fallbackBlock?.id ?? null);
      setError(errorText(loadError, 'Не удалось загрузить модуль'));
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
        throw new Error('Урок не найден');
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
      void navigate(
        isMetricsMode
          ? `/course/${course.id}/metrics/lessons/${nextLessonId}`
          : `/course/${course.id}/lesson/${nextLessonId}`,
      );
    } catch (loadError) {
      setError(errorText(loadError, 'Не удалось загрузить урок'));
    }
  };

  // Из сводки: выбираем студента и открываем метрики первого урока курса.
  const openStudentMetrics = (userId: string) => {
    useCourseMetricsStore.getState().setSelectedStudent(userId);
    const firstLesson = (course?.blocks || []).flatMap(
      (block) => block.lessons || [],
    )[0];
    if (firstLesson) void openLesson(firstLesson.id);
  };

  const openCourseEditor = () => {
    if (course?.id && canUpdateCourse) {
      void navigate(`/course/${course.id}/edit`);
    }
  };

  const openCourseMetrics = () => {
    if (course?.id && canUpdateCourse) {
      void navigate(`/course/${course.id}/metrics`);
    }
  };

  const enrollToCourse = async () => {
    if (!course?.id || isCourseSigning) {
      return;
    }

    setEnrollmentError('');
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
        getErrorMessage(error, 'Не удалось записаться на курс.') ?? '',
      );
    }
  };

  if (!canViewCourseInfo && !isMetricsMode) {
    return (
      <section className="container section course-viewer tw:flex tw:flex-col tw:gap-[24px] tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:[--glass-fallback-bg:rgba(243,_239,_231,_0.94)] tw:no-backdrop-filter:[--glass-bg-strong:var(--glass-fallback-bg)] tw:transparency-reduce:[--glass-bg-strong:var(--glass-fallback-bg)] tw:max-760:[--glass-blur:12px] tw:no-backdrop-filter:[--glass-backdrop:none] tw:transparency-reduce:[--glass-backdrop:none] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:dark:[.page_&]:[--muted:#c4b9a7] tw:dark:[.page_&]:[--eyebrow:#a0c4ff] tw:dark:[.page_&]:[--ink-accent:#dfd2bf] tw:dark:[.page_&]:[--info-text:#b7ab99] tw:dark:[.page_&]:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:dark:[.page_&]:[--glass-bg-strong:rgba(44,_44,_44,_0.92)] tw:dark:[.page_&]:[--glass-fallback-bg:rgba(31,_31,_31,_0.96)] tw:[&_.glass-card]:[background:var(--glass-bg)] tw:no-backdrop-filter:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:[&_.glass-card]:[backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card::after]:[content:none]">
        <SectionTop label="Курс" title="Доступ ограничен" />
        <article className="glass-card course-viewer-error tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[.course-viewer_&]:[background:var(--glass-bg)] tw:[.course-viewer_&]:[backdrop-filter:var(--glass-backdrop)] tw:[.course-viewer_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:no-backdrop-filter:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[.course-viewer_&]:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
          Курс недоступен для вашей роли. Обратитесь к администратору
          организации, чтобы получить доступ.
        </article>
      </section>
    );
  }

  if (isLoadingCourse) {
    return (
      <section className="container section course-viewer tw:flex tw:flex-col tw:gap-[24px] tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:[--glass-fallback-bg:rgba(243,_239,_231,_0.94)] tw:dark:[--muted:#c4b9a7] tw:dark:[--eyebrow:#a0c4ff] tw:dark:[--ink-accent:#dfd2bf] tw:dark:[--info-text:#b7ab99] tw:dark:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:no-backdrop-filter:[--glass-bg-strong:var(--glass-fallback-bg)] tw:transparency-reduce:[--glass-bg-strong:var(--glass-fallback-bg)] tw:dark:[--glass-bg-strong:rgba(44,_44,_44,_0.92)] tw:max-760:[--glass-blur:12px] tw:no-backdrop-filter:[--glass-backdrop:none] tw:transparency-reduce:[--glass-backdrop:none] tw:dark:[--glass-fallback-bg:rgba(31,_31,_31,_0.96)] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:dark:no-backdrop-filter:[--glass-bg-strong:rgba(44,_44,_44,_0.92)] tw:dark:transparency-reduce:[--glass-bg-strong:rgba(44,_44,_44,_0.92)] tw:[&_.glass-card]:[background:var(--glass-bg)] tw:no-backdrop-filter:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:[&_.glass-card]:[backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card::after]:[content:none]">
        <article className="glass-card course-viewer-loading-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-bg)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:no-backdrop-filter:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
          <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.72] tw:m-[10px_0_0] tw:text-[1rem] tw:tracking-[0.012em]">
            Загружаем курс...
          </p>
        </article>
      </section>
    );
  }

  if (error && !course) {
    return (
      <section className="container section course-viewer tw:flex tw:flex-col tw:gap-[24px] tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:[--glass-fallback-bg:rgba(243,_239,_231,_0.94)] tw:no-backdrop-filter:[--glass-bg-strong:var(--glass-fallback-bg)] tw:transparency-reduce:[--glass-bg-strong:var(--glass-fallback-bg)] tw:max-760:[--glass-blur:12px] tw:no-backdrop-filter:[--glass-backdrop:none] tw:transparency-reduce:[--glass-backdrop:none] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:dark:[.page_&]:[--muted:#c4b9a7] tw:dark:[.page_&]:[--eyebrow:#a0c4ff] tw:dark:[.page_&]:[--ink-accent:#dfd2bf] tw:dark:[.page_&]:[--info-text:#b7ab99] tw:dark:[.page_&]:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:dark:[.page_&]:[--glass-bg-strong:rgba(44,_44,_44,_0.92)] tw:dark:[.page_&]:[--glass-fallback-bg:rgba(31,_31,_31,_0.96)] tw:[&_.glass-card]:[background:var(--glass-bg)] tw:no-backdrop-filter:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:[&_.glass-card]:[backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card::after]:[content:none]">
        <article className="glass-card course-viewer-error tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[.course-viewer_&]:[background:var(--glass-bg)] tw:[.course-viewer_&]:[backdrop-filter:var(--glass-backdrop)] tw:[.course-viewer_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:no-backdrop-filter:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[.course-viewer_&]:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
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
      <>
        <Breadcrumbs
          selectedCourse={course}
          selectedBlock={selectedBlock}
          selectedLesson={selectedLesson}
        />
        <section className="container section course-viewer course-enrollment-view tw:relative tw:z-[1] tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-[24px] tw:rounded-[24px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[28px] tw:max-760:p-[20px]">
          <SectionTop label="Метрики курса" title="Доступ ограничен" />
          <article className="glass-card course-viewer-error tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[.course-viewer_&]:[background:var(--glass-bg)] tw:[.course-viewer_&]:[backdrop-filter:var(--glass-backdrop)] tw:[.course-viewer_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:no-backdrop-filter:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[.course-viewer_&]:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
            Для просмотра метрик нужны права управления курсом.
          </article>
        </section>
      </>
    );
  }

  if (!isMetricsMode && !canReadCourseContent) {
    return (
      <>
        <Breadcrumbs
          selectedCourse={course}
          selectedBlock={selectedBlock}
          selectedLesson={selectedLesson}
        />
        <section className="container section course-viewer course-enrollment-view tw:relative tw:z-[1] tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-[24px] tw:rounded-[24px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[28px] tw:max-760:p-[20px]">
          {error && (
            <article
              className="glass-card course-viewer-error tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[.course-viewer_&]:[background:var(--glass-bg)] tw:[.course-viewer_&]:[backdrop-filter:var(--glass-backdrop)] tw:[.course-viewer_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:no-backdrop-filter:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[.course-viewer_&]:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
              role="alert"
            >
              {error}
            </article>
          )}
          <CourseBasicInfo course={course} />
          <article className="glass-card locked-course-card generated-course-enroll-card tw:border-(--glass-border) tw:items-center tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:gap-[16px] tw:overflow-hidden tw:p-[18px_22px] tw:border-solid tw:rounded-[22px] tw:relative tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-bg)] tw:max-980:items-stretch tw:max-980:grid-cols-[1fr] tw:max-980:flex-col tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:no-backdrop-filter:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_.btn]:max-w-[100%] tw:[&_.btn]:min-w-[0] tw:[&_.btn]:flex-[0_1_auto] tw:[&_.btn]:whitespace-normal tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
            <div className="tw:[&:not(.generated-course-actions)]:min-w-[0]">
              <h2 className="tw:max-w-[100%] tw:wrap-anywhere tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em]">
                Прохождение курса недоступно
              </h2>
              <p className="tw:mt-[8px] tw:m-[0] tw:max-w-[100%] tw:wrap-anywhere tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                {isAuthenticated
                  ? 'Вы можете смотреть информацию о курсе, но для открытия модулей, уроков, теории, практики и ИИ-ментора нужны дополнительные права.'
                  : 'Вы можете смотреть информацию о курсе без авторизации. Войдите, чтобы получить доступ к прохождению курса.'}
              </p>
            </div>
            {(!isAuthenticated || canUpdateCourse) && (
              <div className="generated-course-actions tw:flex tw:flex-wrap tw:gap-[10px] tw:justify-end tw:max-w-[100%] tw:min-w-[0] tw:max-980:justify-start">
                {!isAuthenticated && (
                  <button
                    type="button"
                    className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[.generated-course-enroll-card_&]:whitespace-normal tw:[.generated-course-enroll-card_&]:min-w-[0] tw:[.generated-course-enroll-card_&]:flex-[0_1_auto] tw:[.generated-course-enroll-card_&]:max-w-[100%] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
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
                      className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[.generated-course-enroll-card_&]:whitespace-normal tw:[.generated-course-enroll-card_&]:min-w-[0] tw:[.generated-course-enroll-card_&]:flex-[0_1_auto] tw:[.generated-course-enroll-card_&]:max-w-[100%] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                      onClick={openCourseEditor}
                    >
                      Редактировать курс
                    </button>
                    <button
                      type="button"
                      className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[.generated-course-enroll-card_&]:whitespace-normal tw:[.generated-course-enroll-card_&]:min-w-[0] tw:[.generated-course-enroll-card_&]:flex-[0_1_auto] tw:[.generated-course-enroll-card_&]:max-w-[100%] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
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
      </>
    );
  }

  if (!isMetricsMode && !isEnrolled && !canViewWithoutEnrollment) {
    return (
      <>
        <Breadcrumbs
          selectedCourse={course}
          selectedBlock={selectedBlock}
          selectedLesson={selectedLesson}
        />
        <section className="container section course-viewer course-enrollment-view tw:relative tw:z-[1] tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-[24px] tw:rounded-[24px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[28px] tw:max-760:p-[20px]">
          {error && (
            <article
              className="glass-card course-viewer-error tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[.course-viewer_&]:[background:var(--glass-bg)] tw:[.course-viewer_&]:[backdrop-filter:var(--glass-backdrop)] tw:[.course-viewer_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:no-backdrop-filter:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[.course-viewer_&]:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
              role="alert"
            >
              {error}
            </article>
          )}
          <CourseBasicInfo course={course} />
          <article className="glass-card locked-course-card generated-course-enroll-card tw:border-(--glass-border) tw:items-center tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:gap-[16px] tw:overflow-hidden tw:p-[18px_22px] tw:border-solid tw:rounded-[22px] tw:relative tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-bg)] tw:max-980:items-stretch tw:max-980:grid-cols-[1fr] tw:max-980:flex-col tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:no-backdrop-filter:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_.btn]:max-w-[100%] tw:[&_.btn]:min-w-[0] tw:[&_.btn]:flex-[0_1_auto] tw:[&_.btn]:whitespace-normal tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
            <div className="tw:[&:not(.generated-course-actions)]:min-w-[0]">
              <h2 className="tw:max-w-[100%] tw:wrap-anywhere tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em]">
                Содержимое курса закрыто
              </h2>
              <p className="tw:mt-[8px] tw:m-[0] tw:max-w-[100%] tw:wrap-anywhere tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                Запишитесь на курс, чтобы открыть модули, уроки, теорию,
                практику и ИИ-ментора.
              </p>
            </div>
            <div className="generated-course-actions generated-course-edit-actions tw:flex tw:flex-wrap tw:gap-[10px] tw:justify-end tw:max-w-[100%] tw:min-w-[0] tw:self-center tw:max-980:justify-start tw:[&_.btn]:min-w-[190px]">
              <button
                type="button"
                className="btn btn-solid tw:min-w-[0] tw:flex-[0_1_auto] tw:max-w-[100%] tw:whitespace-normal tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:[&&]:min-w-[0] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                onClick={enrollToCourse}
                disabled={isCourseSigning}
              >
                {isCourseSigning ? 'Записываем...' : 'Записаться на курс'}
              </button>
              {canUpdateCourse && (
                <>
                  <button
                    type="button"
                    className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[.generated-course-enroll-card_&]:whitespace-normal tw:[.generated-course-edit-actions_&]:min-w-[190px] tw:[.generated-course-enroll-card_&]:min-w-[0] tw:[.generated-course-enroll-card_&]:flex-[0_1_auto] tw:[.generated-course-enroll-card_&]:max-w-[100%] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                    onClick={openCourseEditor}
                  >
                    Редактировать курс
                  </button>
                  <button
                    type="button"
                    className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[.generated-course-enroll-card_&]:whitespace-normal tw:[.generated-course-edit-actions_&]:min-w-[190px] tw:[.generated-course-enroll-card_&]:min-w-[0] tw:[.generated-course-enroll-card_&]:flex-[0_1_auto] tw:[.generated-course-enroll-card_&]:max-w-[100%] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
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
      </>
    );
  }

  if (!isMetricsMode && !isLearningStarted) {
    return (
      <>
        <Breadcrumbs
          selectedCourse={course}
          selectedBlock={selectedBlock}
          selectedLesson={selectedLesson}
        />
        <section className="container section course-viewer course-enrollment-view tw:relative tw:z-[1] tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-[24px] tw:rounded-[24px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[28px] tw:max-760:p-[20px]">
          {error && (
            <article
              className="glass-card course-viewer-error tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[.course-viewer_&]:[background:var(--glass-bg)] tw:[.course-viewer_&]:[backdrop-filter:var(--glass-backdrop)] tw:[.course-viewer_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:no-backdrop-filter:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.course-viewer_&]:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[.course-viewer_&]:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
              role="alert"
            >
              {error}
            </article>
          )}
          <CourseBasicInfo course={course} />
          <article className="generated-course-enroll-card tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:justify-between tw:gap-[20px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line) tw:pt-[24px]">
            <div className="tw:[&:not(.generated-course-actions)]:min-w-[0]">
              <h2 className="tw:max-w-[100%] tw:wrap-anywhere tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em]">
                {canViewWithoutEnrollment
                  ? 'Курс доступен для просмотра'
                  : 'Курс доступен для прохождения'}
              </h2>
              <p className="tw:mt-[8px] tw:m-[0] tw:max-w-[100%] tw:wrap-anywhere tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                {canViewWithoutEnrollment
                  ? 'Нажмите кнопку, чтобы открыть структуру курса для чтения.'
                  : 'Нажмите кнопку, чтобы открыть структуру курса и начать обучение.'}
              </p>
              {isProgressTracked && progressSummary.total > 0 && (
                <CourseProgressBar summary={progressSummary} />
              )}
            </div>
            <div className="generated-course-actions tw:flex tw:flex-wrap tw:gap-[10px] tw:justify-end tw:max-w-[100%] tw:min-w-[0] tw:max-980:justify-start">
              <button
                type="button"
                className="btn btn-solid tw:flex-[0_1_auto] tw:max-w-[100%] tw:min-w-[0] tw:whitespace-normal tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                onClick={startLearning}
              >
                {canViewWithoutEnrollment
                  ? 'Посмотреть теорию'
                  : isProgressTracked && progressSummary.started > 0
                    ? 'Продолжить обучение'
                    : 'Перейти к обучению'}
              </button>
              {canUpdateCourse && (
                <>
                  <button
                    type="button"
                    className="btn btn-outline tw:flex-[0_1_auto] tw:max-w-[100%] tw:min-w-[0] tw:whitespace-normal tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                    onClick={openCourseEditor}
                  >
                    Редактировать курс
                  </button>
                  <button
                    type="button"
                    className="btn btn-solid tw:flex-[0_1_auto] tw:max-w-[100%] tw:min-w-[0] tw:whitespace-normal tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
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
      </>
    );
  }

  const sectionLabel = isMetricsMode
    ? 'Метрики курса'
    : selectedLesson
      ? 'Урок'
      : selectedBlock
        ? 'Модуль'
        : 'Курс';
  const sectionTitle = isMetricsMode
    ? selectedLesson?.title || selectedBlock?.title || course.title
    : selectedLesson?.title || selectedBlock?.title || course.title;
  const isLessonChatEnabled =
    !isMetricsMode && canReadCourseContent && Boolean(selectedLesson);
  const isChatAvailable = isLessonChatEnabled;
  const showContents = Boolean(selectedLesson);

  return (
    <section className="container section lesson-view generated-course-learning-view tw:relative tw:z-[1] tw:w-full">
      <Breadcrumbs
        selectedCourse={course}
        selectedBlock={selectedBlock}
        selectedLesson={selectedLesson}
      />
      {isMetricsMode && (
        <SectionTop label={sectionLabel} title={sectionTitle} />
      )}
      {error && (
        <article
          className="glass-card course-viewer-error tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:[.lesson-view_&:not(.lesson-main-card)]:[background:var(--glass-bg)] tw:no-backdrop-filter:[.lesson-view_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.lesson-view_&]:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[.lesson-view_&:not(.lesson-main-card)]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[.lesson-view_&:not(.lesson-main-card)]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[.lesson-view_&]:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
          role="alert"
        >
          {error}
        </article>
      )}
      <LessonChatWorkspace
        className={`generated-course-learning-grid ${!showContents ? 'is-overview-layout' : contentsCollapsed ? 'is-contents-collapsed' : ''}`}
        chatEnabled={isLessonChatEnabled}
        chatAvailable={isChatAvailable}
        chatKey={selectedLesson?.id || 'no-lesson'}
        chatProps={{
          courseId: course.id,
          lessonId: selectedLesson?.id,
          lessonTitle: selectedLesson?.title,
          contentBlocks,
        }}
      >
        {!showContents ? null : contentsCollapsed ? (
          <CollapsedCourseContents
            onExpand={() => setContentsCollapsed(false)}
          />
        ) : course.blocks.length > 0 ? (
          <CourseNavigationTree
            onCollapse={() => setContentsCollapsed(true)}
            selectedCourse={course}
            selectedBlock={
              isMetricsMode && !selectedLesson
                ? NO_SELECTED_BLOCK
                : selectedBlock || course.blocks[0]
            }
            selectedLessonId={selectedLesson?.id || ''}
            summaryItem={
              isMetricsMode
                ? {
                    label: 'Сводка по курсу',
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
            mode={isMetricsMode ? 'metrics' : 'theory'}
            lessonProgressById={isProgressTracked ? lessonProgressById : null}
            progressSummary={progressSummary}
          />
        ) : (
          <aside className="course-nav-tree generated-course-navigation-shell tw:grid tw:gap-[10px] tw:sticky tw:top-[72px] tw:max-h-[calc(100vh_-_88px)] tw:overflow-x-hidden tw:overflow-y-auto tw:border-solid tw:border-(--glass-border) tw:rounded-[20px] tw:p-[18px_16px] tw:text-(--text) tw:[align-self:start] tw:max-1100:static tw:max-1100:max-h-[none] tw:max-1100:overflow-y-visible tw:[overscroll-behavior-y:contain] tw:[scrollbar-gutter:stable] tw:[border-width:1px] tw:[background:linear-gradient(var(--glass-highlight),_var(--glass-highlight)),_rgba(var(--accent-rgb),_0.05),_var(--glass-bg)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset),_inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.66)_transparent] tw:max-1100:min-h-[auto] tw:dark:[.page_&]:border-[rgba(233,_222,_203,_0.24)] tw:no-backdrop-filter:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[background:var(--glass-fallback-bg)] tw:dark:[.page_&]:text-[#f2e7d4] tw:dark:[.page_&]:[background:linear-gradient(var(--glass-highlight),_var(--glass-highlight)),_var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[background:var(--glass-bg)] tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[background:var(--glass-bg)]">
            <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
              В курсе пока нет модулей.
            </p>
          </aside>
        )}

        <article
          ref={theoryContainerRef}
          className="glass-card lesson-main-card generated-course-main-card tw:min-w-0 tw:w-full"
          onScroll={(event) => {
            event.currentTarget.classList.toggle(
              'is-scrolled',
              event.currentTarget.scrollTop > 8,
            );
          }}
        >
          <div className="lesson-scroll-frame generated-course-scroll-frame tw:[&_.lesson-agent-start]:[background:transparent]! tw:[&_.lesson-agent-start]:border-0! tw:[&_.lesson-agent-start]:p-0! tw:[&_.lesson-agent-head_h2]:text-[22px]! tw:min-w-0 tw:rounded-[24px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[28px] tw:max-760:p-[20px] tw:[&_h2]:[font-family:Unbounded,sans-serif] tw:[&_h3]:[font-family:Unbounded,sans-serif] tw:[&_.content-block-card]:border-0! tw:[&_.content-block-card]:bg-transparent! tw:[&_.content-block-card]:p-0! tw:[&_.content-block-card_>_.course-viewer-eyebrow]:hidden tw:[&_.content-block-markdown]:bg-transparent! tw:[&_.content-block-markdown]:p-0! tw:[&_.content-block-markdown]:mt-0! tw:[&_.content-block-markdown_h3]:text-(--heading)! tw:[&_.course-category]:hidden">
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
                <LessonBasicInfo
                  lesson={lessonBasicInfo}
                  compact
                  level={formatCourseLevel(course.difficulty || course.level)}
                />
                {activeTab === 'questions' ? (
                  <LessonTestAgent
                    key={`${selectedBlock.id}:${selectedLesson.id}:test`}
                    moduleId={selectedBlock.id}
                    lessonId={selectedLesson.id}
                    onChecked={handleAssessmentChecked('testCompletedAt')}
                    onBackToTheory={() =>
                      setLessonActiveTab(selectedLesson.id, 'theory')
                    }
                  />
                ) : activeTab === 'practice' ? (
                  <LessonPracticeAgent
                    key={`${selectedBlock.id}:${selectedLesson.id}:practice`}
                    moduleId={selectedBlock.id}
                    lessonId={selectedLesson.id}
                    onChecked={handleAssessmentChecked('practiceCompletedAt')}
                    onBackToTheory={() =>
                      setLessonActiveTab(selectedLesson.id, 'theory')
                    }
                  />
                ) : (
                  <div className="lesson-theory-content">
                    {lessonBasicInfo?.description && (
                      <p className="tw:mb-[28px] tw:leading-[1.8]">
                        {lessonBasicInfo.description}
                      </p>
                    )}
                    {isLoadingLesson ? (
                      <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
                        Загружаем теорию урока...
                      </p>
                    ) : (
                      <ContentBlocks
                        presentation="document"
                        ref={theoryContentRef}
                        blocks={contentBlocks}
                        lessonId={selectedLesson.id}
                        ownerUserId={courseCreatorId || currentUserId}
                      />
                    )}
                    <button
                      type="button"
                      className="tw:mt-[28px] tw:rounded-full tw:border tw:border-solid tw:border-(--line) tw:border-transparent! tw:bg-(--contrast) tw:px-[28px] tw:py-[12px] tw:text-[14px] tw:font-semibold tw:text-(--text-solid) tw:cursor-pointer"
                      onClick={() =>
                        setLessonActiveTab(selectedLesson.id, 'questions')
                      }
                    >
                      Перейти к вопросам
                    </button>
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
