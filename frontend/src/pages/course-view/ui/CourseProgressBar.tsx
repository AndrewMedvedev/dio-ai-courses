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
    <div className="course-progress-summary tw:grid tw:gap-[6px] tw:mt-[14px] tw:max-w-[420px]">
      <div className="course-progress-summary-row tw:flex tw:items-baseline tw:justify-between tw:gap-[8px] tw:text-(--muted) tw:text-[0.86rem]">
        <span>
          Пройдено уроков: {summary.completed} из {summary.total}
        </span>
        <b className="tw:text-(--progress-done) tw:font-[800]">
          {summary.percent}%
        </b>
      </div>
      <div
        className="course-nav-progress-bar tw:relative tw:h-[6px] tw:overflow-hidden tw:rounded-[999px] tw:[background:var(--progress-track)]"
        role="progressbar"
        aria-label="Прогресс курса"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.percent}
      >
        <span
          className="tw:block tw:h-[100%] tw:min-w-[0] tw:rounded-[inherit] tw:[background:var(--progress-done)] tw:[transition:width_0.4s_ease]"
          style={{ width: `${summary.percent}%` }}
        />
      </div>
    </div>
  );
}
