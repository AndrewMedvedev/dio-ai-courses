// Метрики урока на странице метрик курса: выбор студента и периода, плитки,
// общий график «активное время + глубина просмотра» и таблица сессий теории.
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  useCourseMetricsStore,
  type MetricsPeriod,
} from "../model/course-metrics-store";
import { METRICS_STUDENTS_LIMIT } from "../model/constants";
import {
  activeTimeTone,
  formatAxisValue,
  formatDateTime,
  formatDuration,
  formatShortDate,
  percentTone,
  pluralRu,
  toDateInputValue,
} from "../lib/metrics-format";

interface PeriodOption {
  id: MetricsPeriod;
  label: string;
  days?: number;
}

const PERIODS: PeriodOption[] = [
  { id: "7", label: "7 дней", days: 7 },
  { id: "30", label: "30 дней", days: 30 },
  { id: "all", label: "Всё время" },
  { id: "custom", label: "Период…" },
];

const SESSION_FORMS = ["сессия", "сессии", "сессий"] as const;

function periodRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { dateFrom: toDateInputValue(from), dateTo: toDateInputValue(to) };
}

function timeOf(value: string | null | undefined) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export interface LessonMetricsDashboardProps {
  courseId: string;
  lesson: { id?: string } | null | undefined;
}

/** Метрики теории урока: выбор студента и периода, плитки, график и таблица сессий. */
export function LessonMetricsDashboard({
  courseId,
  lesson,
}: LessonMetricsDashboardProps) {
  const students = useCourseMetricsStore((state) => state.students);
  const isStudentsLoading = useCourseMetricsStore(
    (state) => state.isStudentsLoading,
  );
  const studentsError = useCourseMetricsStore((state) => state.studentsError);
  const usersCache = useCourseMetricsStore((state) => state.usersCache);
  const selectedStudentUserId = useCourseMetricsStore(
    (state) => state.selectedStudentUserId,
  );
  const sessions = useCourseMetricsStore((state) => state.sessions);
  const sessionsFilters = useCourseMetricsStore(
    (state) => state.sessionsFilters,
  );
  const isSessionsLoading = useCourseMetricsStore(
    (state) => state.isSessionsLoading,
  );
  const sessionsError = useCourseMetricsStore((state) => state.sessionsError);
  const setSelectedStudent = useCourseMetricsStore(
    (state) => state.setSelectedStudent,
  );
  const resetSessions = useCourseMetricsStore((state) => state.resetSessions);
  const setFilters = useCourseMetricsStore((state) => state.setFilters);
  const loadStudents = useCourseMetricsStore((state) => state.loadStudents);
  const loadSessions = useCourseMetricsStore((state) => state.loadSessions);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const lessonId = lesson?.id || "";
  const period = sessionsFilters.period || "all";
  const isDateRangeInvalid = Boolean(
    sessionsFilters.dateFrom &&
      sessionsFilters.dateTo &&
      sessionsFilters.dateFrom > sessionsFilters.dateTo,
  );

  // Другой урок — другие сессии; выбранный студент и период остаются.
  useEffect(() => {
    resetSessions();
    setHoveredIndex(-1);
  }, [lessonId, resetSessions]);

  useEffect(() => {
    if (!courseId) return;
    loadStudents(courseId, { page: 1, size: METRICS_STUDENTS_LIMIT }).catch(
      () => null,
    );
  }, [courseId, loadStudents]);

  // Студент не выбран (или не из этого курса) — сразу показываем первого.
  useEffect(() => {
    if (!students.length) return;
    if (students.some((student) => student.userId === selectedStudentUserId))
      return;
    setSelectedStudent(students[0].userId);
  }, [selectedStudentUserId, setSelectedStudent, students]);

  useEffect(() => {
    if (!lessonId || !selectedStudentUserId || isDateRangeInvalid) return;
    loadSessions(lessonId, selectedStudentUserId).catch(() => null);
  }, [
    isDateRangeInvalid,
    lessonId,
    loadSessions,
    selectedStudentUserId,
    sessionsFilters.createdFrom,
    sessionsFilters.createdTo,
    sessionsFilters.sort,
  ]);

  const choosePeriod = (option: PeriodOption) => {
    if (option.id === "all") {
      setFilters({ period: "all", dateFrom: "", dateTo: "" });
    } else if (option.id === "custom") {
      setFilters({ period: "custom" });
    } else {
      setFilters({ period: option.id, ...periodRange(option.days ?? 0) });
    }
  };

  const chronological = useMemo(
    () =>
      [...sessions].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt)),
    [sessions],
  );
  const newestFirst = useMemo(
    () => [...chronological].reverse(),
    [chronological],
  );

  const stats = useMemo(() => {
    const totalActive = sessions.reduce(
      (sum, session) => sum + (session.activeTimeSeconds || 0),
      0,
    );
    const completed = sessions.filter((session) => session.completedAt);
    const firstCompleted = completed
      .map((session) => session.completedAt)
      .sort((a, b) => timeOf(a) - timeOf(b))[0];
    const bestDepth = Math.max(
      0,
      ...sessions.map((session) => session.maxScrollDepthPercent || 0),
    );
    const maxActive = Math.max(
      1,
      ...sessions.map((session) => session.activeTimeSeconds || 0),
    );
    return {
      totalActive,
      averageActive: sessions.length ? totalActive / sessions.length : 0,
      completedCount: completed.length,
      firstCompleted,
      bestDepth: Math.round(bestDepth),
      scaleMax: Math.max(60, Math.ceil(maxActive / 60) * 60),
    };
  }, [sessions]);

  const periodHint =
    period === "7"
      ? "за 7 дней"
      : period === "30"
        ? "за 30 дней"
        : period === "custom"
          ? "за выбранный период"
          : "за всё время";

  let body: ReactNode = null;
  if (!selectedStudentUserId) {
    body = (
      <p className="cm-empty cm-empty-large tw:m-[0] tw:text-(--muted) tw:p-[36px_20px] tw:rounded-[18px] tw:text-center tw:[border:1px_dashed_var(--cm-border)]">
        {isStudentsLoading
          ? "Загружаем студентов…"
          : "На курс пока никто не записан — метрик нет."}
      </p>
    );
  } else if (isDateRangeInvalid) {
    body = (
      <p
        className="cm-error tw:m-[0] tw:p-[10px_14px] tw:rounded-[12px] tw:text-(--cm-bad-ink) tw:font-[600] tw:[background:var(--cm-bad-bg)] tw:[&&&]:text-[0.92rem] tw:[&&&]:leading-[1.45]"
        role="alert"
      >
        Дата начала периода не должна быть позже даты окончания.
      </p>
    );
  } else if (sessionsError) {
    body = (
      <p
        className="cm-error tw:m-[0] tw:p-[10px_14px] tw:rounded-[12px] tw:text-(--cm-bad-ink) tw:font-[600] tw:[background:var(--cm-bad-bg)]"
        role="alert"
      >
        {sessionsError}
      </p>
    );
  } else if (isSessionsLoading && sessions.length === 0) {
    body = (
      <p className="cm-empty cm-empty-large tw:m-[0] tw:text-(--muted) tw:p-[36px_20px] tw:rounded-[18px] tw:text-center tw:[border:1px_dashed_var(--cm-border)]">
        Загружаем метрики…
      </p>
    );
  } else if (sessions.length === 0) {
    body = (
      <p className="cm-empty cm-empty-large tw:m-[0] tw:text-(--muted) tw:p-[36px_20px] tw:rounded-[18px] tw:text-center tw:[border:1px_dashed_var(--cm-border)]">
        Студент не открывал теорию этого урока {periodHint}.
      </p>
    );
  } else {
    body = (
      <>
        <div className="cm-kpis tw:grid tw:grid-cols-[repeat(4,_minmax(0,_1fr))] tw:gap-[12px] tw:max-980:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:max-520:grid-cols-[minmax(0,_1fr)]">
          <article className="cm-kpi tw:flex tw:flex-col tw:items-start tw:gap-[3px] tw:min-w-[0] tw:p-[14px_16px] tw:rounded-[16px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
            <span className="tw:first:text-(--muted) tw:first:text-[0.82rem] tw:first:font-[700]">
              Сессий
            </span>
            <strong className="tw:text-(--heading) tw:text-[1.75rem] tw:leading-[1.15]">
              {sessions.length}
            </strong>
            <small className="tw:text-(--muted) tw:text-[0.8rem]">
              {periodHint}
            </small>
          </article>
          <article className="cm-kpi tw:flex tw:flex-col tw:items-start tw:gap-[3px] tw:min-w-[0] tw:p-[14px_16px] tw:rounded-[16px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
            <span className="tw:first:text-(--muted) tw:first:text-[0.82rem] tw:first:font-[700]">
              Активное время
            </span>
            <strong className="tw:text-(--heading) tw:text-[1.75rem] tw:leading-[1.15]">
              {formatDuration(stats.totalActive)}
            </strong>
            <small className="tw:text-(--muted) tw:text-[0.8rem]">
              в среднем {formatDuration(stats.averageActive)}
            </small>
          </article>
          <article className="cm-kpi tw:flex tw:flex-col tw:items-start tw:gap-[3px] tw:min-w-[0] tw:p-[14px_16px] tw:rounded-[16px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
            <span className="tw:first:text-(--muted) tw:first:text-[0.82rem] tw:first:font-[700]">
              Глубина просмотра
            </span>
            <strong className="tw:text-(--heading) tw:text-[1.75rem] tw:leading-[1.15]">
              {stats.bestDepth}%
            </strong>
            <small className="tw:text-(--muted) tw:text-[0.8rem]">
              лучшая сессия
            </small>
          </article>
          <article className="cm-kpi tw:flex tw:flex-col tw:items-start tw:gap-[3px] tw:min-w-[0] tw:p-[14px_16px] tw:rounded-[16px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
            <span className="tw:first:text-(--muted) tw:first:text-[0.82rem] tw:first:font-[700]">
              Теория
            </span>
            <span
              className={`cm-pill cm-pill-large tw:inline-block tw:p-[5px_12px] tw:rounded-[99px] tw:text-[0.95rem] tw:font-[800] tw:whitespace-nowrap tw:[&.is-good]:text-(--cm-good-ink) tw:[&.is-neutral]:text-(--muted) tw:[.cm-kpi_>_&:first-child]:text-[0.82rem] tw:[.cm-kpi_>_&:first-child]:font-[700] tw:[&.is-good]:[background:var(--cm-good-bg)] tw:[&.is-neutral]:[background:var(--cm-neutral-bg)] tw:[.cm-kpi_>_&:first-child]:text-(--muted) ${stats.firstCompleted ? "is-good" : "is-neutral"}`}
            >
              {stats.firstCompleted
                ? `Пройдена ${formatShortDate(stats.firstCompleted)}`
                : "Не пройдена"}
            </span>
            <small className="tw:text-(--muted) tw:text-[0.8rem]">
              {stats.completedCount} из {sessions.length}{" "}
              {pluralRu(sessions.length, SESSION_FORMS)} завершены
            </small>
          </article>
        </div>

        <section className="cm-panel tw:flex-[2_1_300px] tw:min-w-[0] tw:flex tw:flex-col tw:gap-[6px] tw:p-[16px_18px] tw:rounded-[18px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
          <div className="cm-panel-head tw:flex tw:flex-wrap tw:items-baseline tw:gap-[6px_16px]">
            <h3 className="tw:text-[1rem] tw:flex-[1_1_auto] tw:leading-[1.3] tw:tracking-[-0.008em]">
              Сессии по дням
            </h3>
            <span className="cm-legend tw:inline-flex tw:items-center tw:gap-[6px] tw:text-(--muted) tw:text-[0.78rem]">
              <i className="is-good tw:w-[10px] tw:h-[10px] tw:rounded-[3px] tw:[&:is(.cm-bar_i,i.cm-chart-bar,.cm-legend_i)]:[background:var(--cm-good)]" />{" "}
              Активное время
            </span>
            <span className="cm-legend tw:inline-flex tw:items-center tw:gap-[6px] tw:text-(--muted) tw:text-[0.78rem]">
              <i className="is-depth tw:w-[10px] tw:h-[10px] tw:rounded-[50%] tw:[background:var(--cm-depth)]" />{" "}
              Глубина просмотра, %
            </span>
            <span className="cm-panel-hint tw:text-(--muted) tw:text-[0.84rem] tw:leading-[1.4]">
              Наведите на столбец, чтобы увидеть точные значения
            </span>
          </div>
          <div className="cm-chart-scroll tw:overflow-x-auto tw:pt-[6px]">
            <div
              className="cm-chart tw:grid tw:grid-cols-[52px_repeat(var(--cm-columns,_1),_minmax(56px,_1fr))] tw:gap-x-[10px] tw:min-w-[calc(52px_+_var(--cm-columns,_1)_*_66px)] tw:h-[260px]"
              style={{ "--cm-columns": chronological.length } as CSSProperties}
              onMouseLeave={() => setHoveredIndex(-1)}
            >
              <div
                className="cm-chart-axis tw:flex tw:flex-col tw:justify-between tw:pb-[28px] tw:text-(--muted) tw:text-[0.72rem] tw:text-right"
                aria-hidden="true"
              >
                <span>{formatAxisValue(stats.scaleMax)}</span>
                <span>{formatAxisValue(stats.scaleMax / 2)}</span>
                <span>0</span>
              </div>
              {chronological.map((session, index) => {
                const active = session.activeTimeSeconds || 0;
                const depth = Math.min(
                  100,
                  Math.max(0, Math.round(session.maxScrollDepthPercent || 0)),
                );
                const description = `${formatDateTime(session.createdAt)} · ${formatDuration(active)} · ${depth}% · ${session.completedAt ? "завершена" : "не завершена"}`;
                return (
                  <button
                    type="button"
                    key={session.id || `${session.createdAt}-${index}`}
                    className={`cm-chart-col tw:grid tw:grid-rows-[1fr_28px] tw:min-w-[0] tw:p-[0] tw:rounded-[10px] tw:text-[inherit] tw:cursor-default tw:[border:0] tw:[background:transparent] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:focus-visible:[outline:2px_solid_rgba(var(--accent-rgb),_0.9)] tw:focus-visible:[outline-offset:2px] ${hoveredIndex === index ? "is-hovered" : ""}`}
                    aria-label={description}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onFocus={() => setHoveredIndex(index)}
                    onBlur={() => setHoveredIndex(-1)}
                  >
                    <span className="cm-chart-area tw:relative tw:flex tw:justify-center tw:items-end tw:rounded-[8px_8px_0_0] tw:[border-bottom:1px_solid_var(--cm-line)] tw:[.cm-chart-col.is-hovered_&]:[background:rgba(var(--accent-rgb),_0.12)] tw:[.cm-chart-col:focus-visible_&]:[background:rgba(var(--accent-rgb),_0.12)]">
                      <i
                        className={`cm-chart-bar tw:block tw:w-[58%] tw:max-w-[48px] tw:rounded-[6px_6px_2px_2px] tw:[.cm_&.is-good:is(.cm-bar_i,i.cm-chart-bar,.cm-legend_i)]:[background:var(--cm-good)] tw:[.cm_&.is-warning:is(.cm-bar_i,i.cm-chart-bar)]:[background:var(--cm-warn)] tw:[.cm_&.is-danger:is(.cm-bar_i,i.cm-chart-bar)]:[background:var(--cm-bad)] ${activeTimeTone(active)}`}
                        style={{
                          height: `${Math.max(2, (active / stats.scaleMax) * 100)}%`,
                        }}
                      />
                      <i
                        className="cm-chart-dot tw:absolute tw:left-[50%] tw:w-[12px] tw:h-[12px] tw:ml-[-6px] tw:rounded-[50%] tw:[border:2px_solid_var(--glass-bg-strong,_#ffffff)] tw:[background:var(--cm-depth)]"
                        style={{ bottom: `calc(${depth}% - 6px)` }}
                      />
                      {hoveredIndex === index ? (
                        <span
                          className={`cm-chart-tip tw:absolute tw:top-[6px] tw:left-[50%] tw:z-[2] tw:max-w-[260px] tw:p-[7px_11px] tw:rounded-[10px] tw:text-[#fbf8f2] tw:text-[0.8rem] tw:font-[600] tw:leading-[1.35] tw:text-left tw:w-[max-content] tw:whitespace-normal tw:pointer-events-none tw:[&.is-left]:left-[auto] tw:[background:#2b2724] tw:dark:text-[#1f1d1a] tw:[box-shadow:0_10px_26px_rgba(0,_0,_0,_0.24)] tw:[&.is-left]:right-[50%] tw:dark:[background:#f2e7d4] ${index > chronological.length / 2 ? "is-left" : ""}`}
                          role="tooltip"
                        >
                          {description}
                        </span>
                      ) : null}
                    </span>
                    <span className="cm-chart-label tw:self-center tw:text-(--muted) tw:text-[0.74rem]">
                      {formatShortDate(session.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="cm-panel tw:flex-[2_1_300px] tw:min-w-[0] tw:flex tw:flex-col tw:gap-[6px] tw:p-[16px_18px] tw:rounded-[18px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
          <h3 className="tw:text-[1rem] tw:leading-[1.3] tw:tracking-[-0.008em]">
            Все сессии
          </h3>
          <div className="cm-table-scroll tw:overflow-x-auto">
            <table className="cm-table tw:w-[100%] tw:min-w-[520px] tw:text-[0.92rem] tw:[border-collapse:collapse]">
              <thead>
                <tr>
                  <th
                    className="tw:p-[8px_6px] tw:text-(--muted) tw:text-[0.74rem] tw:font-[800] tw:tracking-[0.05em] tw:text-left tw:uppercase tw:[border-bottom:1px_solid_var(--cm-line)]"
                    scope="col"
                  >
                    Дата
                  </th>
                  <th
                    className="tw:p-[8px_6px] tw:text-(--muted) tw:text-[0.74rem] tw:font-[800] tw:tracking-[0.05em] tw:text-left tw:uppercase tw:[border-bottom:1px_solid_var(--cm-line)]"
                    scope="col"
                  >
                    Активное время
                  </th>
                  <th
                    className="tw:p-[8px_6px] tw:text-(--muted) tw:text-[0.74rem] tw:font-[800] tw:tracking-[0.05em] tw:text-left tw:uppercase tw:[border-bottom:1px_solid_var(--cm-line)]"
                    scope="col"
                  >
                    Глубина просмотра
                  </th>
                  <th
                    className="tw:p-[8px_6px] tw:text-(--muted) tw:text-[0.74rem] tw:font-[800] tw:tracking-[0.05em] tw:text-left tw:uppercase tw:[border-bottom:1px_solid_var(--cm-line)]"
                    scope="col"
                  >
                    Статус
                  </th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((session, index) => {
                  const depth = Math.min(
                    100,
                    Math.max(0, Math.round(session.maxScrollDepthPercent || 0)),
                  );
                  return (
                    <tr key={session.id || `${session.createdAt}-row-${index}`}>
                      <td className="tw:p-[10px_6px] tw:text-(--text) tw:align-middle tw:[border-bottom:1px_solid_var(--cm-line)] tw:[.cm-table_tr:last-child_&]:[border-bottom:0]">
                        {formatDateTime(session.createdAt)}
                      </td>
                      <td className="tw:p-[10px_6px] tw:text-(--text) tw:align-middle tw:[border-bottom:1px_solid_var(--cm-line)] tw:[.cm-table_tr:last-child_&]:[border-bottom:0]">
                        {formatDuration(session.activeTimeSeconds)}
                      </td>
                      <td className="tw:p-[10px_6px] tw:text-(--text) tw:align-middle tw:[border-bottom:1px_solid_var(--cm-line)] tw:[.cm-table_tr:last-child_&]:[border-bottom:0]">
                        <div className="cm-meter tw:flex tw:items-center tw:gap-[10px]">
                          <div
                            className="cm-bar tw:flex-[1_1_140px] tw:h-[8px] tw:overflow-hidden tw:rounded-[99px] tw:[background:var(--cm-neutral-bg)]"
                            aria-hidden="true"
                          >
                            <i
                              className={`tw:block tw:h-[100%] tw:rounded-[inherit] tw:[.cm_&.is-danger:is(.cm-bar_i,i.cm-chart-bar)]:[background:var(--cm-bad)] tw:[.cm_&.is-good:is(.cm-bar_i,i.cm-chart-bar,.cm-legend_i)]:[background:var(--cm-good)] tw:[.cm_&.is-warning:is(.cm-bar_i,i.cm-chart-bar)]:[background:var(--cm-warn)] ${percentTone(depth) ?? ""}`}
                              style={{ width: `${depth}%` }}
                            />
                          </div>
                          <b className="tw:min-w-[42px] tw:text-(--heading) tw:text-[0.9rem]">
                            {depth}%
                          </b>
                        </div>
                      </td>
                      <td className="tw:p-[10px_6px] tw:text-(--text) tw:align-middle tw:[border-bottom:1px_solid_var(--cm-line)] tw:[.cm-table_tr:last-child_&]:[border-bottom:0]">
                        <span
                          className={`cm-pill tw:inline-block tw:p-[3px_10px] tw:rounded-[99px] tw:text-[0.76rem] tw:font-[800] tw:whitespace-nowrap tw:[&.is-neutral]:text-(--muted) tw:[&.is-good]:text-(--cm-good-ink) tw:[&.is-neutral]:[background:var(--cm-neutral-bg)] tw:[&.is-good]:[background:var(--cm-good-bg)] ${session.completedAt ? "is-good" : "is-neutral"}`}
                        >
                          {session.completedAt ? "Завершена" : "Не завершена"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="cm tw:flex tw:flex-col tw:gap-[16px] tw:min-w-[0] tw:text-(--text) tw:[--cm-panel:rgba(var(--accent-rgb),_0.06)] tw:[--cm-border:rgba(var(--accent-rgb),_0.28)] tw:[--cm-line:rgba(43,_43,_43,_0.1)] tw:[--cm-good:#1f8a4c] tw:[--cm-good-bg:#d9efe2] tw:[--cm-good-ink:#14653a] tw:[--cm-warn:#c98a12] tw:[--cm-warn-bg:#f6e7c4] tw:[--cm-warn-ink:#7a5300] tw:[--cm-bad:#c43c3c] tw:[--cm-bad-bg:#f6d9d6] tw:[--cm-bad-ink:#8f2121] tw:[--cm-depth:#2f5fc4] tw:[--cm-neutral-bg:rgba(43,_43,_43,_0.08)] tw:dark:[--cm-panel:rgba(255,_255,_255,_0.04)] tw:dark:[--cm-border:rgba(255,_255,_255,_0.12)] tw:dark:[--cm-line:rgba(255,_255,_255,_0.1)] tw:dark:[--cm-good:#4cc27f] tw:dark:[--cm-good-bg:rgba(76,_194,_127,_0.16)] tw:dark:[--cm-good-ink:#8fe0b2] tw:dark:[--cm-warn:#e3b341] tw:dark:[--cm-warn-bg:rgba(227,_179,_65,_0.16)] tw:dark:[--cm-warn-ink:#f1d08a] tw:dark:[--cm-bad:#f07070] tw:dark:[--cm-bad-bg:rgba(240,_112,_112,_0.16)] tw:dark:[--cm-bad-ink:#f7a9a9] tw:dark:[--cm-depth:#7ea6ff] tw:dark:[--cm-neutral-bg:rgba(255,_255,_255,_0.08)] tw:[.page_&_p.cm-empty]:text-[0.95rem] tw:[.page_&_p.cm-empty]:leading-[1.5] tw:[.page_&_p.cm-error]:text-[0.92rem] tw:[.page_&_p.cm-error]:leading-[1.45]">
      <div className="cm-toolbar tw:flex tw:flex-wrap tw:items-end tw:gap-[12px_16px]">
        <h2 className="tw:flex-[1_1_200px] tw:[&&&]:text-[1.4rem] tw:[&&&]:leading-[1.25]">
          Теория урока
        </h2>
        <label className="cm-field tw:flex tw:flex-col tw:gap-[4px] tw:text-(--muted) tw:text-[0.78rem] tw:font-[700] tw:max-520:flex-[1_1_100%]">
          <span>Студент</span>
          <select
            className="tw:min-h-[44px] tw:min-w-[220px] tw:p-[0_12px] tw:rounded-[12px] tw:text-(--heading) tw:max-520:min-w-[0] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--glass-bg-strong,_#fffdf9)] tw:[font:inherit] tw:[&&]:font-[700] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:max-520:w-[100%]"
            value={selectedStudentUserId}
            onChange={(event) => setSelectedStudent(event.target.value)}
            disabled={!students.length}
          >
            {!students.length ? (
              <option value="">
                {isStudentsLoading ? "Загружаем…" : "Нет студентов"}
              </option>
            ) : null}
            {students.map((student) => {
              const user = usersCache[student.userId];
              return (
                <option
                  key={student.id || student.userId}
                  value={student.userId}
                >
                  {user?.fullName || user?.email || "Студент"}
                </option>
              );
            })}
          </select>
        </label>
        <div
          className="cm-segmented tw:inline-flex tw:flex-wrap tw:gap-[2px] tw:p-[3px] tw:rounded-[999px] tw:[background:var(--cm-neutral-bg)]"
          role="group"
          aria-label="Период"
        >
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`tw:min-h-[38px] tw:p-[0_14px] tw:rounded-[999px] tw:text-(--muted) tw:cursor-pointer tw:[border:0] tw:[background:transparent] tw:hover:text-(--heading) tw:[.cm-segmented_&.is-active]:text-(--heading) tw:[font:inherit] tw:[&&]:font-[700] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[.cm-segmented_&.is-active]:[background:var(--glass-bg-strong,_#ffffff)] tw:[.cm-segmented_&.is-active]:[box-shadow:0_1px_3px_rgba(0,_0,_0,_0.14)] ${period === option.id ? "is-active" : ""}`}
              aria-pressed={period === option.id}
              onClick={() => choosePeriod(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {period === "custom" ? (
        <div className="cm-dates tw:flex tw:flex-wrap tw:gap-[12px]">
          <label className="cm-field tw:flex tw:flex-col tw:gap-[4px] tw:text-(--muted) tw:text-[0.78rem] tw:font-[700] tw:max-520:flex-[1_1_100%]">
            <span>С даты</span>
            <input
              className="tw:min-h-[44px] tw:min-w-[170px] tw:p-[0_12px] tw:rounded-[12px] tw:text-(--heading) tw:max-520:min-w-[0] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--glass-bg-strong,_#fffdf9)] tw:[font:inherit] tw:[&&]:font-[700] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:max-520:w-[100%]"
              type="date"
              value={sessionsFilters.dateFrom}
              onChange={(event) => setFilters({ dateFrom: event.target.value })}
            />
          </label>
          <label className="cm-field tw:flex tw:flex-col tw:gap-[4px] tw:text-(--muted) tw:text-[0.78rem] tw:font-[700] tw:max-520:flex-[1_1_100%]">
            <span>По дату</span>
            <input
              className="tw:min-h-[44px] tw:min-w-[170px] tw:p-[0_12px] tw:rounded-[12px] tw:text-(--heading) tw:max-520:min-w-[0] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--glass-bg-strong,_#fffdf9)] tw:[font:inherit] tw:[&&]:font-[700] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:max-520:w-[100%]"
              type="date"
              value={sessionsFilters.dateTo}
              onChange={(event) => setFilters({ dateTo: event.target.value })}
            />
          </label>
        </div>
      ) : null}

      {studentsError ? (
        <p
          className="cm-error tw:m-[0] tw:p-[10px_14px] tw:rounded-[12px] tw:text-(--cm-bad-ink) tw:font-[600] tw:[background:var(--cm-bad-bg)]"
          role="alert"
        >
          {studentsError}
        </p>
      ) : null}

      {body}
    </div>
  );
}
