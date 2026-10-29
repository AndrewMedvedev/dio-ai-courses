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
import "./course-metrics.css";

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
      <p className="cm-empty cm-empty-large">
        {isStudentsLoading
          ? "Загружаем студентов…"
          : "На курс пока никто не записан — метрик нет."}
      </p>
    );
  } else if (isDateRangeInvalid) {
    body = (
      <p className="cm-error" role="alert">
        Дата начала периода не должна быть позже даты окончания.
      </p>
    );
  } else if (sessionsError) {
    body = (
      <p className="cm-error" role="alert">
        {sessionsError}
      </p>
    );
  } else if (isSessionsLoading && sessions.length === 0) {
    body = <p className="cm-empty cm-empty-large">Загружаем метрики…</p>;
  } else if (sessions.length === 0) {
    body = (
      <p className="cm-empty cm-empty-large">
        Студент не открывал теорию этого урока {periodHint}.
      </p>
    );
  } else {
    body = (
      <>
        <div className="cm-kpis">
          <article className="cm-kpi">
            <span>Сессий</span>
            <strong>{sessions.length}</strong>
            <small>{periodHint}</small>
          </article>
          <article className="cm-kpi">
            <span>Активное время</span>
            <strong>{formatDuration(stats.totalActive)}</strong>
            <small>в среднем {formatDuration(stats.averageActive)}</small>
          </article>
          <article className="cm-kpi">
            <span>Глубина просмотра</span>
            <strong>{stats.bestDepth}%</strong>
            <small>лучшая сессия</small>
          </article>
          <article className="cm-kpi">
            <span>Теория</span>
            <span
              className={`cm-pill cm-pill-large ${stats.firstCompleted ? "is-good" : "is-neutral"}`}
            >
              {stats.firstCompleted
                ? `Пройдена ${formatShortDate(stats.firstCompleted)}`
                : "Не пройдена"}
            </span>
            <small>
              {stats.completedCount} из {sessions.length}{" "}
              {pluralRu(sessions.length, SESSION_FORMS)} завершены
            </small>
          </article>
        </div>

        <section className="cm-panel">
          <div className="cm-panel-head">
            <h3>Сессии по дням</h3>
            <span className="cm-legend">
              <i className="is-good" /> Активное время
            </span>
            <span className="cm-legend">
              <i className="is-depth" /> Глубина просмотра, %
            </span>
            <span className="cm-panel-hint">
              Наведите на столбец, чтобы увидеть точные значения
            </span>
          </div>
          <div className="cm-chart-scroll">
            <div
              className="cm-chart"
              style={{ "--cm-columns": chronological.length } as CSSProperties}
              onMouseLeave={() => setHoveredIndex(-1)}
            >
              <div className="cm-chart-axis" aria-hidden="true">
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
                    className={`cm-chart-col ${hoveredIndex === index ? "is-hovered" : ""}`}
                    aria-label={description}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onFocus={() => setHoveredIndex(index)}
                    onBlur={() => setHoveredIndex(-1)}
                  >
                    <span className="cm-chart-area">
                      <i
                        className={`cm-chart-bar ${activeTimeTone(active)}`}
                        style={{
                          height: `${Math.max(2, (active / stats.scaleMax) * 100)}%`,
                        }}
                      />
                      <i
                        className="cm-chart-dot"
                        style={{ bottom: `calc(${depth}% - 6px)` }}
                      />
                      {hoveredIndex === index ? (
                        <span
                          className={`cm-chart-tip ${index > chronological.length / 2 ? "is-left" : ""}`}
                          role="tooltip"
                        >
                          {description}
                        </span>
                      ) : null}
                    </span>
                    <span className="cm-chart-label">
                      {formatShortDate(session.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="cm-panel">
          <h3>Все сессии</h3>
          <div className="cm-table-scroll">
            <table className="cm-table">
              <thead>
                <tr>
                  <th scope="col">Дата</th>
                  <th scope="col">Активное время</th>
                  <th scope="col">Глубина просмотра</th>
                  <th scope="col">Статус</th>
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
                      <td>{formatDateTime(session.createdAt)}</td>
                      <td>{formatDuration(session.activeTimeSeconds)}</td>
                      <td>
                        <div className="cm-meter">
                          <div className="cm-bar" aria-hidden="true">
                            <i
                              className={percentTone(depth)}
                              style={{ width: `${depth}%` }}
                            />
                          </div>
                          <b>{depth}%</b>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`cm-pill ${session.completedAt ? "is-good" : "is-neutral"}`}
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
    <div className="cm">
      <div className="cm-toolbar">
        <h2>Теория урока</h2>
        <label className="cm-field">
          <span>Студент</span>
          <select
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
        <div className="cm-segmented" role="group" aria-label="Период">
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={period === option.id ? "is-active" : ""}
              aria-pressed={period === option.id}
              onClick={() => choosePeriod(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {period === "custom" ? (
        <div className="cm-dates">
          <label className="cm-field">
            <span>С даты</span>
            <input
              type="date"
              value={sessionsFilters.dateFrom}
              onChange={(event) => setFilters({ dateFrom: event.target.value })}
            />
          </label>
          <label className="cm-field">
            <span>По дату</span>
            <input
              type="date"
              value={sessionsFilters.dateTo}
              onChange={(event) => setFilters({ dateTo: event.target.value })}
            />
          </label>
        </div>
      ) : null}

      {studentsError ? (
        <p className="cm-error" role="alert">
          {studentsError}
        </p>
      ) : null}

      {body}
    </div>
  );
}
