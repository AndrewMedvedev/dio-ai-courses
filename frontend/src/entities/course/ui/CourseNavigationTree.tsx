import { useEffect, useRef } from "react";
import {
  PROGRESS_STATUS_LABELS,
  getLessonProgressStatus,
  getModuleProgressSummary,
  type LessonProgress,
} from "@/entities/progress/@x/course";

interface NavItem {
  id: string;
  title?: string;
}

interface NavBlock extends NavItem {
  lessons: NavItem[];
  practice: NavItem[];
}

export interface CourseNavigationTreeProps {
  selectedCourse: { title?: string; blocks: NavBlock[] };
  selectedBlock: { id?: string | null };
  selectedLessonId?: string | null;
  selectedPracticeId?: string | null;
  completedLessons: Record<string, boolean | undefined>;
  completedPractices: Record<string, boolean | undefined>;
  openBlock: (blockId: string) => void;
  openLesson: (lessonId: string) => void;
  openPractice: (practiceId: string) => void;
  mode?: "theory" | "practice" | "metrics" | string;
  /** Прогресс ученика с backend: { [lessonId]: LessonProgress | null }. */
  lessonProgressById?: Record<string, LessonProgress | null> | null;
  progressSummary?: {
    completed?: number;
    total?: number;
    percent?: number;
  } | null;
  /** Пункт над модулями (например, «Сводка по курсу» в метриках). */
  summaryItem?: { label: string; active?: boolean; onOpen: () => void } | null;
}

const LESSON_PARTS: Array<{ key: keyof LessonProgress; label: string }> = [
  { key: "theoryCompletedAt", label: "Теория" },
  { key: "practiceCompletedAt", label: "Практика" },
  { key: "testCompletedAt", label: "Проверочные вопросы" },
];

// Одна точка на урок: серая — не начат, жёлтая — пройден частично,
// зелёная — пройдены теория, практика и проверочные вопросы.
function LessonProgressMark({
  progress,
}: {
  progress: LessonProgress | null | undefined;
}) {
  const status = getLessonProgressStatus(progress);
  const details = LESSON_PARTS.map(
    (part) => `${part.label}: ${progress?.[part.key] ? "пройдено" : "нет"}`,
  ).join(", ");

  return (
    <span
      className={`course-nav-progress-dot tw:w-[9px] tw:h-[9px] tw:rounded-[50%] tw:[justify-self:end] tw:[background:var(--progress-idle)] tw:[&.is-in\_progress]:[background:var(--progress-active)] tw:[&.is-completed]:[background:var(--progress-done)] is-${status}`}
      title={`${PROGRESS_STATUS_LABELS[status]}. ${details}`}
      aria-label={`${PROGRESS_STATUS_LABELS[status]}. ${details}`}
    />
  );
}

export function CourseNavigationTree({
  selectedCourse,
  selectedBlock,
  selectedLessonId,
  selectedPracticeId,
  completedLessons,
  completedPractices,
  openBlock,
  openLesson,
  openPractice,
  mode = "theory",
  lessonProgressById = null,
  progressSummary = null,
  summaryItem = null,
}: CourseNavigationTreeProps) {
  const isPracticeMode = mode === "practice";
  const isMetricsMode = mode === "metrics";
  const hasProgress =
    !isPracticeMode && !isMetricsMode && Boolean(lessonProgressById);
  const treeRef = useRef<HTMLElement>(null);
  const selectedBlockId = selectedBlock?.id;

  // Держим выбранный урок (или модуль) в зоне видимости дерева, а не сбрасываем
  // прокрутку дерева в начало при открытии урока.
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const activeItem =
      tree.querySelector(".course-nav-item-btn.is-active") ||
      tree.querySelector(".course-nav-block.is-active .course-nav-block-btn");
    if (!activeItem) return;

    const treeRect = tree.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    const margin = 24;
    if (
      itemRect.top < treeRect.top + margin ||
      itemRect.bottom > treeRect.bottom - margin
    ) {
      tree.scrollTop +=
        itemRect.top - treeRect.top - (treeRect.height - itemRect.height) / 2;
    }
  }, [selectedLessonId, selectedPracticeId, selectedBlockId]);
  const completedItems = selectedCourse.blocks.reduce(
    (total, block) =>
      total +
      (isPracticeMode
        ? block.practice.filter((practice) => completedPractices[practice.id])
            .length
        : block.lessons.filter((lesson) => completedLessons[lesson.id]).length),
    0,
  );
  const totalItems = selectedCourse.blocks.reduce(
    (total, block) =>
      total + (isPracticeMode ? block.practice.length : block.lessons.length),
    0,
  );
  const progressLabel = isMetricsMode
    ? "Метрики"
    : isPracticeMode
      ? "Практика"
      : "Теория";

  const openBlockInCurrentMode = (block: NavBlock) => {
    if (isPracticeMode && block.practice[0]) {
      openPractice(block.practice[0].id);
      return;
    }

    openBlock(block.id);
  };

  return (
    <aside
      ref={treeRef}
      className="course-nav-tree tw:sticky tw:top-[72px] tw:max-h-[calc(100vh_-_88px)] tw:overflow-x-hidden tw:overflow-y-auto tw:border-solid tw:border-(--glass-border) tw:rounded-[20px] tw:p-[18px_16px] tw:text-(--text) tw:[align-self:start] tw:max-1100:static tw:max-1100:max-h-[none] tw:max-1100:overflow-y-visible tw:[overscroll-behavior-y:contain] tw:[scrollbar-gutter:stable] tw:[border-width:1px] tw:dark:border-[rgba(233,_222,_203,_0.24)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset),_inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:dark:text-[#f2e7d4] tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.66)_transparent] tw:max-1100:min-h-[auto] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)]"
      aria-label="Навигация по курсу"
    >
      <div className="course-nav-tree-head tw:grid tw:gap-[6px] tw:p-[0_2px_12px] tw:[border-bottom:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:dark:[border-bottom-color:rgba(255,_255,_255,_0.16)]">
        <strong className="tw:text-(--heading) tw:leading-[1.4] tw:text-[1.04rem] tw:dark:text-[#fff2df]">
          {selectedCourse.title}
        </strong>
        {hasProgress ? (
          <div className="course-nav-progress tw:grid tw:gap-[6px]">
            <div className="course-nav-progress-row tw:flex tw:items-baseline tw:justify-between tw:gap-[8px] tw:text-(--muted) tw:text-[0.86rem]">
              <span className="tw:text-(--muted) tw:text-[0.86rem] tw:dark:text-[#cfc2ad]">
                Пройдено уроков: {progressSummary?.completed ?? 0}/
                {progressSummary?.total ?? 0}
              </span>
              <b className="tw:text-(--progress-done) tw:font-[800]">
                {progressSummary?.percent ?? 0}%
              </b>
            </div>
            <div
              className="course-nav-progress-bar tw:relative tw:h-[6px] tw:overflow-hidden tw:rounded-[999px] tw:[background:var(--progress-track)]"
              role="progressbar"
              aria-label="Прогресс курса"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressSummary?.percent ?? 0}
            >
              <span
                className="tw:block tw:h-[100%] tw:min-w-[0] tw:rounded-[inherit] tw:text-(--muted) tw:text-[0.86rem] tw:[background:var(--progress-done)] tw:[transition:width_0.4s_ease] tw:dark:text-[#cfc2ad]"
                style={{ width: `${progressSummary?.percent ?? 0}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="tw:text-(--muted) tw:text-[0.86rem] tw:dark:text-[#cfc2ad]">
            {isMetricsMode
              ? "Сводка и уроки"
              : `${progressLabel}: ${completedItems}/${totalItems}`}
          </span>
        )}
      </div>
      {summaryItem ? (
        <button
          type="button"
          className={`course-nav-summary-btn tw:block tw:w-[100%] tw:m-[4px_0_8px] tw:p-[10px_12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[12px] tw:text-(--heading) tw:text-left tw:cursor-pointer tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.6)] tw:hover:border-[rgba(var(--accent-rgb),_0.6)] tw:[background:transparent] tw:[font:inherit] tw:[&&]:font-[800] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.18)] tw:hover:[background:rgba(var(--accent-rgb),_0.18)] ${summaryItem.active ? "is-active" : ""}`}
          aria-current={summaryItem.active ? "page" : undefined}
          onClick={summaryItem.onOpen}
        >
          {summaryItem.label}
        </button>
      ) : null}
      <ul className="course-nav-block-list tw:mt-[12px] tw:m-[0] tw:p-[0] tw:grid tw:gap-[10px] tw:[list-style:none]">
        {selectedCourse.blocks.map((block, blockIndex) => {
          const moduleProgress = hasProgress
            ? getModuleProgressSummary(block, lessonProgressById ?? {})
            : null;

          return (
            <li
              key={block.id}
              className={`course-nav-block tw:pl-[8px] tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:[border-left:3px_solid_transparent] tw:[&.has-progress.is-active]:rounded-[0_10px_10px_0] tw:[&.is-active]:[border-left-color:rgb(var(--success-rgb))] tw:[&.has-progress]:[border-left-color:var(--progress-idle)] tw:[&.has-progress.is-in\_progress]:[border-left-color:var(--progress-active)] tw:[&.has-progress.is-completed]:[border-left-color:var(--progress-done)] tw:[&.has-progress.is-active]:[background:rgba(var(--accent-rgb),_0.07)] ${selectedBlock.id === block.id ? "is-active" : ""} ${moduleProgress ? `has-progress is-${moduleProgress.status}` : ""}`}
            >
              <button
                type="button"
                className={`course-nav-block-btn tw:w-[100%] tw:text-[inherit] tw:cursor-pointer tw:text-left tw:grid tw:grid-cols-[24px_minmax(0,_1fr)] tw:gap-[10px] tw:p-[9px_0] tw:[border:0] tw:[background:transparent] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[&.has-progress]:grid-cols-[24px_minmax(0,_1fr)_auto] tw:[align-items:start] ${moduleProgress ? "has-progress" : ""}`}
                onClick={() => openBlockInCurrentMode(block)}
              >
                <span className="tw:text-(--ink-accent) tw:font-[800] tw:dark:text-[#cbaacb]">
                  {blockIndex + 1}
                </span>
                <strong className="tw:text-(--heading) tw:text-[0.98rem] tw:leading-[1.45] tw:wrap-break-word tw:dark:text-[#fff2df] tw:[word-break:normal]">
                  {block.title}
                </strong>
                {moduleProgress && moduleProgress.total > 0 && (
                  <em
                    className={`course-nav-block-progress tw:self-center tw:p-[1px_7px] tw:rounded-[999px] tw:text-(--muted) tw:text-[0.74rem] tw:not-italic tw:font-[800] tw:whitespace-nowrap tw:[background:var(--progress-idle-bg)] tw:[&.is-in\_progress]:text-(--progress-active) tw:[&.is-completed]:text-(--progress-done) tw:[&.is-in\_progress]:[background:var(--progress-active-bg)] tw:[&.is-completed]:[background:var(--progress-done-bg)] is-${moduleProgress.status}`}
                    title={PROGRESS_STATUS_LABELS[moduleProgress.status]}
                  >
                    {moduleProgress.completed}/{moduleProgress.total}
                  </em>
                )}
              </button>
              <ul className="course-nav-item-list tw:m-[0] tw:pt-[6px] tw:p-[3px_0_2px_16px] tw:pb-[6px] tw:grid tw:gap-[5px] tw:[list-style:none]">
                {isPracticeMode
                  ? block.practice.map((practice, practiceIndex) => (
                      <li key={practice.id}>
                        <button
                          type="button"
                          className={`course-nav-item-btn course-nav-practice-btn tw:w-[100%] tw:text-(--ink-accent) tw:cursor-pointer tw:text-left tw:grid tw:grid-cols-[36px_minmax(0,_1fr)_10px] tw:gap-[8px] tw:items-center tw:min-h-[34px] tw:rounded-[8px] tw:p-[6px_8px] tw:[border:0] tw:[background:transparent] tw:[font:inherit] tw:[.page.is-inner-page_&]:gap-[10px] tw:[.page.is-inner-page_&]:min-h-[42px] tw:[.page.is-inner-page_&]:p-[8px_10px] tw:hover:[background:rgba(var(--accent-rgb),_0.13)] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.13)] tw:dark:[.page_&]:text-[#d8c9b1] tw:dark:[.page_&.is-active]:[background:rgba(255,_255,_255,_0.08)] tw:dark:[.page_&:hover]:[background:rgba(255,_255,_255,_0.08)] ${selectedPracticeId === practice.id ? "is-active" : ""}`}
                          onClick={() => openPractice(practice.id)}
                        >
                          <span className="course-nav-item-number tw:text-(--ink-accent) tw:text-[0.82rem] tw:font-[800] tw:whitespace-nowrap tw:[.course-nav-item-btn.has-progress.is-completed_&]:text-(--progress-done) tw:[.course-nav-item-btn.has-progress.is-in\_progress_&]:text-(--progress-active) tw:[.page.is-inner-page_&]:text-(--info-text) tw:[.page.is-inner-page_&]:text-[0.88rem] tw:dark:[.page_&]:text-[#cbaacb]">
                            P{blockIndex + 1}.{practiceIndex + 1}
                          </span>
                          <span className="course-nav-item-title tw:text-(--text) tw:min-w-[0] tw:text-[0.86rem] tw:font-[700] tw:leading-[1.25] tw:wrap-anywhere tw:[.course-nav-item-btn.is-active_&]:text-(--heading) tw:[.page.is-inner-page_&]:text-[0.94rem] tw:[.page.is-inner-page_&]:leading-[1.42] tw:dark:[.page_&]:text-[#f2e7d4] tw:dark:[.page_.course-nav-item-btn.is-active_&]:text-[#ffffff]">
                            {practice.title}
                          </span>
                          <span
                            className={`course-nav-item-status tw:w-[8px] tw:h-[8px] tw:rounded-[50%] tw:[justify-self:end] tw:[background:rgba(var(--accent-rgb),_0.32)] tw:[&.is-done]:[background:rgb(var(--success-rgb))] tw:dark:[.page_&]:[background:rgba(255,_255,_255,_0.22)] ${completedPractices[practice.id] ? "is-done" : ""}`}
                          />
                        </button>
                      </li>
                    ))
                  : block.lessons.map((lesson, lessonIndex) => (
                      <li
                        className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]"
                        key={lesson.id}
                      >
                        <button
                          type="button"
                          className={`course-nav-item-btn tw:w-[100%] tw:text-[inherit] tw:cursor-pointer tw:text-left tw:grid tw:grid-cols-[36px_minmax(0,_1fr)_10px] tw:gap-[10px] tw:items-center tw:min-h-[42px] tw:rounded-[8px] tw:p-[8px_10px] tw:[border:0] tw:[background:transparent] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[&.has-progress]:grid-cols-[36px_minmax(0,_1fr)_auto] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.13)] tw:hover:[background:rgba(var(--accent-rgb),_0.13)] tw:dark:[.page_&.is-active]:[background:rgba(255,_255,_255,_0.08)] tw:dark:hover:[background:rgba(255,_255,_255,_0.08)] ${selectedLessonId === lesson.id ? "is-active" : ""} ${hasProgress ? `has-progress is-${getLessonProgressStatus(lessonProgressById?.[lesson.id])}` : ""}`}
                          onClick={() => openLesson(lesson.id)}
                        >
                          <span className="course-nav-item-number tw:text-(--info-text) tw:text-[0.88rem] tw:font-[800] tw:whitespace-nowrap tw:[.course-nav-item-btn.has-progress.is-in\_progress_&]:text-(--progress-active) tw:[.course-nav-item-btn.has-progress.is-completed_&]:text-(--progress-done)">
                            {blockIndex + 1}.{lessonIndex + 1}
                          </span>
                          <span className="course-nav-item-title tw:text-(--text) tw:min-w-[0] tw:text-[0.94rem] tw:font-[700] tw:leading-[1.42] tw:wrap-anywhere tw:[.course-nav-item-btn.is-active_&]:text-(--heading) tw:dark:text-[#f2e7d4] tw:dark:[.page_.course-nav-item-btn.is-active_&]:text-[#ffffff]">
                            {lesson.title}
                          </span>
                          {hasProgress ? (
                            <LessonProgressMark
                              progress={lessonProgressById?.[lesson.id]}
                            />
                          ) : (
                            !isMetricsMode && (
                              <span
                                className={`course-nav-item-status tw:w-[8px] tw:h-[8px] tw:rounded-[50%] tw:[justify-self:end] tw:[background:rgba(var(--accent-rgb),_0.32)] tw:dark:[background:rgba(255,_255,_255,_0.22)] tw:[&.is-done]:[background:rgb(var(--success-rgb))] tw:dark:[&.is-done]:[background:rgba(255,_255,_255,_0.22)] ${completedLessons[lesson.id] ? "is-done" : ""}`}
                              />
                            )
                          )}
                        </button>
                      </li>
                    ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
