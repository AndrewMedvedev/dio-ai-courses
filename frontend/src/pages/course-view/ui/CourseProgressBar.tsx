export interface CourseProgressSummary {
  completed: number;
  total: number;
  percent: number;
}

/** Полоса прогресса курса: сколько уроков пройдено. */
export function CourseProgressBar({
  summary,
}: {
  summary: CourseProgressSummary;
}) {
  return (
    <div className="course-progress-summary">
      <div className="course-progress-summary-row">
        <span>
          Пройдено уроков: {summary.completed} из {summary.total}
        </span>
        <b>{summary.percent}%</b>
      </div>
      <div
        className="course-nav-progress-bar"
        role="progressbar"
        aria-label="Прогресс курса"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.percent}
      >
        <span style={{ width: `${summary.percent}%` }} />
      </div>
    </div>
  );
}
