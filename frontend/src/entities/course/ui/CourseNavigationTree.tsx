import { useEffect, useId, useRef, useState } from 'react';
import { useUiLayoutStore, type LessonTab } from '@/shared/lib/ui-layout';
import { themedScrollbarClass } from '@/shared/ui/themed-scrollbar';
import { Chevron } from '@/shared/ui/chevron';
import {
  PROGRESS_STATUS_LABELS,
  getLessonProgressStatus,
  type LessonProgress,
  type ProgressStatus,
} from '@/entities/progress/@x/course';

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
  mode?: string;
  onCollapse?: () => void;
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

const PARTS: { id: LessonTab; field: keyof LessonProgress; label: string }[] = [
  { id: 'theory', field: 'theoryCompletedAt', label: 'Теория' },
  { id: 'questions', field: 'testCompletedAt', label: 'Проверочные вопросы' },
  { id: 'practice', field: 'practiceCompletedAt', label: 'Практика' },
];
const plurals = new Intl.PluralRules('ru');
function countLabel(count: number, practice = false) {
  const forms = practice
    ? { one: 'задание', few: 'задания', other: 'заданий' }
    : { one: 'урок', few: 'урока', other: 'уроков' };
  const form = plurals.select(count);
  return `${count} ${form === 'one' ? forms.one : form === 'few' ? forms.few : forms.other}`;
}
function ProgressDot({ status }: { status: ProgressStatus }) {
  const color =
    status === 'completed'
      ? 'tw:bg-(--progress-done)'
      : status === 'in_progress'
        ? 'tw:bg-(--progress-active)'
        : 'tw:bg-(--progress-idle)';
  return (
    <span
      className={`course-nav-progress-dot tw:inline-block tw:size-[10px] tw:shrink-0 tw:rounded-full ${color}`}
      data-progress-status={status}
      role="img"
      aria-label={PROGRESS_STATUS_LABELS[status]}
    />
  );
}

function TreeIcon({ name }: { name: 'next' | 'theory' | 'practice' }) {
  const paths = {
    next: 'M5 4v16M10 5l10 7-10 7Z',
    theory: 'M6 3h8l4 4v14H6ZM14 3v5h4',
    practice: 'm4 16 12-12 4 4L8 20H4Zm10-10 4 4',
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="tw:block tw:shrink-0"
    >
      <path d={paths[name]} />
    </svg>
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
  mode = 'theory',
  onCollapse,
  lessonProgressById = null,
  progressSummary = null,
  summaryItem = null,
}: CourseNavigationTreeProps) {
  const treeRef = useRef<HTMLDivElement>(null);
  const treeId = useId();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const setLessonTab = useUiLayoutStore((state) => state.setLessonActiveTab);
  const activeTab = useUiLayoutStore((state) =>
    state.getLessonActiveTab(selectedLessonId || ''),
  );
  const isPractice = mode === 'practice';
  const isMetrics = mode === 'metrics';
  const activeId = (isPractice ? selectedPracticeId : selectedLessonId) || '';
  const activeBlockId =
    selectedCourse.blocks.find((block) =>
      (isPractice ? block.practice : block.lessons).some(
        (item) => item.id === activeId,
      ),
    )?.id || selectedBlock?.id;
  const hasProgress = !isPractice && !isMetrics && Boolean(lessonProgressById);
  const totalItems = selectedCourse.blocks.reduce(
    (sum, block) => sum + (isPractice ? block.practice : block.lessons).length,
    0,
  );
  const completedItems = selectedCourse.blocks.reduce(
    (sum, block) =>
      sum +
      (isPractice ? block.practice : block.lessons).filter((item) =>
        isPractice
          ? completedPractices[item.id]
          : hasProgress
            ? getLessonProgressStatus(lessonProgressById?.[item.id]) ===
              'completed'
            : completedLessons[item.id],
      ).length,
    0,
  );
  const completed = hasProgress
    ? (progressSummary?.completed ?? completedItems)
    : completedItems;
  const total = hasProgress
    ? (progressSummary?.total ?? totalItems)
    : totalItems;
  const percent = Math.max(
    0,
    Math.min(
      100,
      (hasProgress ? progressSummary?.percent : undefined) ??
        (total ? Math.round((completed / total) * 100) : 0),
    ),
  );

  useEffect(() => {
    if (activeBlockId)
      setExpanded((previous) =>
        previous[activeBlockId]
          ? previous
          : { ...previous, [activeBlockId]: true },
      );
  }, [activeBlockId, activeId]);
  useEffect(() => {
    const tree = treeRef.current;
    const item = tree?.querySelector<HTMLElement>(
      '.course-nav-item-btn.is-active',
    );
    if (!tree || !item) return;
    const frame = window.requestAnimationFrame(() => {
      const bounds = tree.getBoundingClientRect();
      const itemBounds = item.getBoundingClientRect();
      if (
        itemBounds.top < bounds.top + 20 ||
        itemBounds.bottom > bounds.bottom - 20
      )
        tree.scrollTop +=
          itemBounds.top - bounds.top - (bounds.height - itemBounds.height) / 2;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeId, activeBlockId]);

  const button =
    'tw:w-full tw:min-w-0 tw:rounded-[12px] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:p-[12px] tw:text-left tw:[font-family:inherit] tw:text-[16px] tw:font-semibold tw:leading-[1.5] tw:text-(--text) tw:cursor-pointer tw:hover:bg-(--surface) tw:focus-visible:outline-2 tw:focus-visible:outline-(--contrast)';
  const active =
    'tw:border-(--navigation-active-border)! tw:bg-(--navigation-active)!';
  return (
    <aside
      aria-label="Навигация по курсу"
      className="course-nav-tree tw:sticky tw:top-[82px] tw:min-w-0 tw:overflow-hidden tw:rounded-[22px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[6px] tw:max-760:static"
    >
      {onCollapse && (
        <div className="tw:px-[4px] tw:pt-[8px] tw:pb-[12px] tw:flex tw:items-center tw:justify-end tw:gap-[12px]">
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Свернуть содержание"
            aria-expanded="true"
            data-tip="Свернуть содержание курса. Его можно открыть снова стрелкой рядом с уроком."
            className="tw:grid tw:size-[32px] tw:shrink-0 tw:place-items-center tw:rounded-full tw:border tw:border-solid tw:border-(--line) tw:bg-(--surface) tw:p-0 tw:leading-none tw:text-(--muted) tw:cursor-pointer"
          >
            <Chevron />
          </button>
        </div>
      )}
      <div
        ref={treeRef}
        className={`${themedScrollbarClass} course-nav-tree-scroll tw:max-h-[calc(100dvh_-_164px)] tw:overflow-y-auto tw:overflow-x-hidden tw:px-[4px] tw:py-[8px] tw:[overscroll-behavior:contain] tw:[scrollbar-gutter:stable] tw:max-760:max-h-[314px]`}
      >
        <strong
          data-tip={selectedCourse.title}
          className="tw:line-clamp-4 tw:text-[16px] tw:leading-[1.5] tw:[overflow-wrap:anywhere] tw:[text-wrap:pretty]"
        >
          {selectedCourse.title}
        </strong>
        <div className="tw:my-[14px]">
          <p className="tw:m-0 tw:text-[14px] tw:text-(--muted)">
            {isMetrics
              ? 'Метрики курса'
              : `${completed} из ${total} ${isPractice ? 'заданий' : 'уроков'} пройдено · ${percent}%`}
          </p>
          {!isMetrics && (
            <div
              role="progressbar"
              aria-label="Прогресс курса"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="tw:mt-[12px] tw:h-[6px] tw:overflow-hidden tw:rounded-full tw:bg-(--line)"
            >
              <span
                className={`tw:block tw:h-full tw:rounded-full ${percent >= 75 ? 'tw:bg-(--progress-done)' : percent >= 50 ? 'tw:bg-(--progress-active)' : 'tw:bg-(--progress-coral)'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
        {summaryItem && (
          <button
            type="button"
            className={`${button} ${summaryItem.active ? active : ''}`}
            aria-current={summaryItem.active ? 'page' : undefined}
            onClick={summaryItem.onOpen}
          >
            {summaryItem.label}
          </button>
        )}
        <ul className="tw:m-0 tw:grid tw:grid-cols-[minmax(0,1fr)] tw:list-none tw:gap-[10px] tw:p-0">
          {selectedCourse.blocks.map((block, blockIndex) => {
            const items = isPractice ? block.practice : block.lessons;
            const isOpen = expanded[block.id] ?? block.id === activeBlockId;
            return (
              <li
                key={block.id}
                className={`course-nav-block tw:min-w-0 tw:border-0 tw:p-0 ${block.id === activeBlockId ? 'is-active' : ''}`}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`${treeId}-${block.id}`}
                  onClick={() => {
                    setExpanded((previous) => ({
                      ...previous,
                      [block.id]: !isOpen,
                    }));
                    if (!isOpen && !activeId) {
                      if (isPractice && block.practice[0])
                        openPractice(block.practice[0].id);
                      else openBlock(block.id);
                    }
                  }}
                  className={`${button} course-nav-block-btn tw:border-(--line)! tw:bg-(--surface)!`}
                >
                  <span className="tw:mb-[8px] tw:block tw:text-[11px] tw:uppercase tw:text-(--muted)">
                    Модуль {String(blockIndex + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="tw:line-clamp-3 tw:[overflow-wrap:anywhere] tw:[text-wrap:pretty]"
                    data-tip={block.title}
                  >
                    {block.title}
                  </span>
                  {!isOpen && (
                    <span className="tw:mt-[8px] tw:block tw:text-[12px] tw:text-(--muted)">
                      {countLabel(items.length, isPractice)}
                    </span>
                  )}
                </button>
                {isOpen && (
                  <ul
                    id={`${treeId}-${block.id}`}
                    className="tw:mt-[10px] tw:mb-0 tw:ml-[2px] tw:grid tw:min-w-0 tw:list-none tw:gap-[6px] tw:border-0 tw:border-l tw:border-solid tw:border-(--line) tw:py-0 tw:pr-0 tw:pl-[6px]"
                  >
                    {items.map((item, index) => {
                      const selected = activeId === item.id;
                      const progress = lessonProgressById?.[item.id];
                      const done = isPractice
                        ? completedPractices[item.id]
                        : completedLessons[item.id];
                      const recorded = hasProgress
                        ? getLessonProgressStatus(progress)
                        : done
                          ? 'completed'
                          : 'not_started';
                      const status: ProgressStatus =
                        recorded === 'not_started' && selected && !isMetrics
                          ? 'in_progress'
                          : recorded;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            aria-label={`${index + 1}. ${item.title}`}
                            aria-current={selected ? 'page' : undefined}
                            data-tip={`${item.title} — ${PROGRESS_STATUS_LABELS[status]}`}
                            onClick={() =>
                              isPractice
                                ? openPractice(item.id)
                                : openLesson(item.id)
                            }
                            className={`${button} course-nav-item-btn ${selected ? `is-active ${active}` : 'tw:py-[8px]! tw:text-[14px]!'}`}
                          >
                            {selected && (
                              <span className="tw:mb-[8px] tw:block tw:text-[11px] tw:uppercase tw:text-(--muted)">
                                Текущий урок
                              </span>
                            )}
                            <span className="tw:flex tw:min-w-0 tw:items-start tw:gap-[12px]">
                              {!selected && (
                                <span className="tw:flex tw:h-[21px] tw:w-[14px] tw:shrink-0 tw:items-center tw:justify-center tw:text-(--muted)">
                                  {status === 'not_started' ? (
                                    <TreeIcon name="next" />
                                  ) : (
                                    <ProgressDot status={status} />
                                  )}
                                </span>
                              )}
                              <span
                                className={`tw:min-w-0 tw:[overflow-wrap:anywhere] tw:[text-wrap:pretty] ${selected ? 'tw:line-clamp-3' : 'tw:line-clamp-2'}`}
                              >
                                {index + 1}. {item.title}
                              </span>
                            </span>
                          </button>
                          {selected && !isPractice && !isMetrics && (
                            <div className="tw:mt-[8px] tw:ml-[4px] tw:grid tw:min-w-0 tw:gap-[6px] tw:border-0 tw:border-l tw:border-solid tw:border-(--line) tw:pl-[6px]">
                              {PARTS.map((part) => {
                                const partDone = Boolean(
                                  progress?.[part.field] ||
                                  (!hasProgress && done),
                                );
                                const partStatus: ProgressStatus = partDone
                                  ? 'completed'
                                  : activeTab === part.id
                                    ? 'in_progress'
                                    : 'not_started';
                                return (
                                  <button
                                    type="button"
                                    key={part.id}
                                    aria-label={part.label}
                                    aria-pressed={activeTab === part.id}
                                    data-tip={`${part.label}: ${PROGRESS_STATUS_LABELS[partStatus]}`}
                                    onClick={() =>
                                      setLessonTab(item.id, part.id)
                                    }
                                    className={`${button} course-nav-lesson-part tw:flex tw:min-h-[54px] tw:items-center tw:gap-[10px] tw:text-[14px]! ${activeTab === part.id ? active : ''}`}
                                  >
                                    <span
                                      className={`tw:flex tw:w-[14px] tw:shrink-0 tw:items-center tw:justify-center ${activeTab === part.id ? 'tw:text-(--eyebrow)' : 'tw:text-(--muted)'}`}
                                    >
                                      {partDone || part.id === 'questions' ? (
                                        <ProgressDot status={partStatus} />
                                      ) : (
                                        <TreeIcon
                                          name={
                                            part.id === 'practice'
                                              ? 'practice'
                                              : 'theory'
                                          }
                                        />
                                      )}
                                    </span>
                                    <span>{part.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
