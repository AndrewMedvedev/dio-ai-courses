import {
  PROGRESS_STATUS_LABELS,
  getLessonProgressStatus,
  type LessonProgress,
} from '@/entities/progress/@x/course';

export interface LessonListItem {
  id: string;
  order?: number;
  title?: string;
}

export interface LessonListProps {
  lessons: LessonListItem[] | null | undefined;
  selectedLessonId?: string | null;
  onSelectLesson: (lessonId: string) => void;
  /** Прогресс уроков ученика; без него статусы не показываются. */
  progressById?: Record<string, LessonProgress | null> | null;
}

export function LessonList({
  lessons,
  selectedLessonId,
  onSelectLesson,
  progressById = null,
}: LessonListProps) {
  if (!Array.isArray(lessons) || lessons.length === 0) {
    return (
      <article className="course-viewer-document lesson-list tw:min-w-0 tw:w-full tw:text-(--text) tw:[&_h1]:m-0 tw:mt-[28px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line) tw:pt-[24px]">
        <h2>Уроки</h2>
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
          В выбранном модуле пока нет уроков.
        </p>
      </article>
    );
  }

  return (
    <article className="course-viewer-document lesson-list tw:min-w-0 tw:w-full tw:text-(--text) tw:[&_h1]:m-0 tw:mt-[28px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line) tw:pt-[24px]">
      <h2 className="tw:mb-[14px] tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em]">
        Уроки модуля
      </h2>
      <ul className="course-pick-list tw:grid tw:gap-0 tw:m-0 tw:p-0 tw:list-none">
        {lessons.map((lesson, index) => {
          const isSelected = lesson.id === selectedLessonId;
          const status = progressById
            ? getLessonProgressStatus(progressById[lesson.id])
            : null;

          return (
            <li
              className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]"
              key={lesson.id}
            >
              <button
                type="button"
                className={String.raw`course-pick-item tw:grid tw:grid-cols-[auto_minmax(0,1fr)_auto] tw:items-start tw:gap-[12px] tw:w-full tw:border-0 tw:border-b tw:border-solid tw:border-(--line) tw:bg-transparent tw:px-[4px] tw:py-[16px] tw:text-left tw:text-[16px] tw:leading-[1.5] tw:text-(--text) tw:[font-family:inherit] tw:cursor-pointer tw:hover:text-(--contrast) tw:focus-visible:outline-2 tw:focus-visible:outline-(--contrast) tw:disabled:cursor-not-allowed tw:disabled:opacity-60 ${isSelected ? 'is-selected' : ''} ${status ? `has-progress is-${status}` : ''}`}
                onClick={() => onSelectLesson(lesson.id)}
              >
                {/* Номер по месту в списке: order с бэкенда начинается с 1. */}
                <span className="course-pick-order tw:text-(--ink-accent) tw:font-[800]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{lesson.title}</span>
                {status && (
                  <span
                    className={String.raw`course-pick-progress tw:self-center tw:p-[2px_9px] tw:rounded-[999px] tw:text-(--muted) tw:text-[0.78rem] tw:font-[800] tw:whitespace-nowrap tw:[background:var(--progress-idle-bg)] tw:[&.is-completed]:text-(--progress-done) tw:[&.is-in\_progress]:text-(--progress-active) tw:[&.is-completed]:[background:var(--progress-done-bg)] tw:[&.is-in\_progress]:[background:var(--progress-active-bg)] is-${status}`}
                  >
                    {PROGRESS_STATUS_LABELS[status]}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
