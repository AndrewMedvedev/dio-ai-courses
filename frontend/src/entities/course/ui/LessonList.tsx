import {
  PROGRESS_STATUS_LABELS,
  getLessonProgressStatus,
  type LessonProgress,
} from "@/entities/progress/@x/course";

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
      <article className="course-viewer-card course-viewer-side-card">
        <h2>Уроки</h2>
        <p className="course-viewer-muted">
          В выбранном модуле пока нет уроков.
        </p>
      </article>
    );
  }

  return (
    <article className="course-viewer-card course-viewer-side-card">
      <h2>Уроки модуля</h2>
      <ul className="course-pick-list">
        {lessons.map((lesson, index) => {
          const isSelected = lesson.id === selectedLessonId;
          const status = progressById
            ? getLessonProgressStatus(progressById[lesson.id])
            : null;

          return (
            <li key={lesson.id}>
              <button
                type="button"
                className={`course-pick-item ${isSelected ? "is-selected" : ""} ${status ? `has-progress is-${status}` : ""}`}
                onClick={() => onSelectLesson(lesson.id)}
              >
                {/* Номер по месту в списке: order с бэкенда начинается с 1. */}
                <span className="course-pick-order">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{lesson.title}</span>
                {status && (
                  <span className={`course-pick-progress is-${status}`}>
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
