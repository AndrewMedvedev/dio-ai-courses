// Сводка по курсу на странице метрик: плитки, таблица студентов и распределение
// по прогрессу. Данные: участники курса (/members) и их прогресс (/progress/.../students).
import { useEffect, useMemo, useState } from "react";
import {
  normalizeCourseProgress,
  fetchCourseStudentsProgress,
  type CourseProgress,
} from "@/entities/progress";
import { useCourseMetricsStore } from "../model/course-metrics-store";
import { METRICS_STUDENTS_LIMIT } from "../model/constants";
import { getInitials, percentTone, pluralRu } from "../lib/metrics-format";
import "./course-metrics.css";

const BUCKETS = ["0–25%", "25–50%", "50–75%", "75–100%"];
const STUDENT_FORMS = ["студент", "студента", "студентов"] as const;

interface ProgressState {
  loading: boolean;
  error: string;
  byUser: Record<string, CourseProgress>;
}

function bucketOf(percent: number) {
  return Math.min(3, Math.floor((Number(percent) || 0) / 25));
}

function statusOf(record: CourseProgress | null) {
  if (!record) return { label: "Не начал", tone: "is-neutral" };
  if (record.percent >= 100) return { label: "Завершил", tone: "is-good" };
  return { label: "Учится", tone: "is-warning" };
}

export interface CourseMetricsSummaryProps {
  courseId: string;
  onOpenStudent?: (userId: string) => void;
}

/** Сводка по курсу: плитки, таблица студентов и распределение по прогрессу. */
export function CourseMetricsSummary({
  courseId,
  onOpenStudent,
}: CourseMetricsSummaryProps) {
  const students = useCourseMetricsStore((state) => state.students);
  const studentsMeta = useCourseMetricsStore((state) => state.studentsMeta);
  const isStudentsLoading = useCourseMetricsStore(
    (state) => state.isStudentsLoading,
  );
  const studentsError = useCourseMetricsStore((state) => state.studentsError);
  const usersCache = useCourseMetricsStore((state) => state.usersCache);
  const loadStudents = useCourseMetricsStore((state) => state.loadStudents);
  const [progress, setProgress] = useState<ProgressState>({
    loading: true,
    error: "",
    byUser: {},
  });

  useEffect(() => {
    if (!courseId) return;
    loadStudents(courseId, { page: 1, size: METRICS_STUDENTS_LIMIT }).catch(
      () => null,
    );
  }, [courseId, loadStudents]);

  useEffect(() => {
    if (!courseId) return undefined;
    const controller = new AbortController();
    setProgress({ loading: true, error: "", byUser: {} });
    fetchCourseStudentsProgress(
      courseId,
      { size: METRICS_STUDENTS_LIMIT },
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        const byUser: Record<string, CourseProgress> = {};
        response.items.forEach((item) => {
          const record = normalizeCourseProgress(item);
          if (record?.userId) byUser[record.userId] = record;
        });
        setProgress({ loading: false, error: "", byUser });
      })
      .catch((error: Error | null) => {
        if (controller.signal.aborted) return;
        setProgress({
          loading: false,
          error: error?.message || "Не удалось загрузить прогресс студентов.",
          byUser: {},
        });
      });
    return () => controller.abort();
  }, [courseId]);

  const rows = useMemo(
    () =>
      students
        .map((student) => {
          const record = progress.byUser[student.userId] || null;
          const user = usersCache[student.userId];
          return {
            key: student.id || student.userId,
            userId: student.userId,
            name: user?.fullName || user?.email || "Студент",
            email: user?.fullName ? user?.email || "" : "",
            avatarUrl: user?.avatarUrl || "",
            record,
            percent: record ? Math.round(record.percent) : 0,
            status: statusOf(record),
          };
        })
        .sort(
          (a, b) =>
            Number(Boolean(b.record)) - Number(Boolean(a.record)) ||
            b.percent - a.percent ||
            a.name.localeCompare(b.name, "ru"),
        ),
    [progress.byUser, students, usersCache],
  );

  const totals = useMemo(() => {
    const count = rows.length;
    const average = count
      ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / count)
      : 0;
    const completed = rows.filter((row) => row.percent >= 100).length;
    const notStarted = rows.filter((row) => !row.record).length;
    const buckets = BUCKETS.map(() => 0);
    rows.forEach((row) => {
      buckets[bucketOf(row.percent)] += 1;
    });
    return { count, average, completed, notStarted, buckets };
  }, [rows]);

  const totalStudents = Math.max(studentsMeta.total || 0, rows.length);
  const maxBucket = Math.max(1, ...totals.buckets);
  const isLoading = isStudentsLoading || progress.loading;
  const completedShare = totals.count
    ? Math.round((totals.completed * 100) / totals.count)
    : 0;

  return (
    <div className="cm">
      <div className="cm-toolbar">
        <h2>Сводка по курсу</h2>
        <span className="cm-hint">
          Прогресс считается по урокам, где пройдены теория, практика и
          проверочные вопросы.
        </span>
      </div>

      {studentsError || progress.error ? (
        <p className="cm-error" role="alert">
          {studentsError || progress.error}
        </p>
      ) : null}

      <div className="cm-kpis">
        <article className="cm-kpi">
          <span>Студентов</span>
          <strong>{isLoading ? "…" : totalStudents}</strong>
          <small>записаны на курс</small>
        </article>
        <article className="cm-kpi">
          <span>Средний прогресс</span>
          <strong>{isLoading ? "…" : `${totals.average}%`}</strong>
          <small>по всем студентам</small>
        </article>
        <article className="cm-kpi">
          <span>Завершили курс</span>
          <strong>{isLoading ? "…" : totals.completed}</strong>
          <small>{isLoading ? "" : `${completedShare}% студентов`}</small>
        </article>
        <article className="cm-kpi">
          <span>Не начали</span>
          <strong>{isLoading ? "…" : totals.notStarted}</strong>
          <small>ещё не открывали курс</small>
        </article>
      </div>

      <div className="cm-row">
        <section className="cm-panel cm-panel-wide">
          <h3>Студенты</h3>
          <p className="cm-panel-hint">
            Сортировка по прогрессу. Нажмите на студента, чтобы открыть его
            метрики по урокам.
          </p>
          {isLoading && rows.length === 0 ? (
            <p className="cm-empty">Загружаем студентов…</p>
          ) : rows.length === 0 ? (
            <p className="cm-empty">На курс пока никто не записан.</p>
          ) : (
            <div className="cm-table-scroll">
              <table className="cm-table">
                <thead>
                  <tr>
                    <th scope="col">Студент</th>
                    <th scope="col">Прогресс курса</th>
                    <th scope="col">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className="is-clickable"
                      onClick={() => onOpenStudent?.(row.userId)}
                    >
                      <td>
                        <button
                          type="button"
                          className="cm-person"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenStudent?.(row.userId);
                          }}
                        >
                          <span className="cm-avatar" aria-hidden="true">
                            {row.avatarUrl ? (
                              <img src={row.avatarUrl} alt="" />
                            ) : (
                              getInitials(row.name)
                            )}
                          </span>
                          <span className="cm-person-text">
                            <strong>{row.name}</strong>
                            {row.email ? <small>{row.email}</small> : null}
                          </span>
                        </button>
                      </td>
                      <td>
                        <div className="cm-meter">
                          <div
                            className="cm-bar"
                            role="progressbar"
                            aria-label={`Прогресс ${row.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={row.percent}
                          >
                            <i
                              className={percentTone(row.percent)}
                              style={{ width: `${row.percent}%` }}
                            />
                          </div>
                          <b>{row.percent}%</b>
                        </div>
                      </td>
                      <td>
                        <span className={`cm-pill ${row.status.tone}`}>
                          {row.status.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalStudents > rows.length && rows.length > 0 ? (
            <p className="cm-panel-hint">
              Показаны первые {rows.length} из {totalStudents}{" "}
              {pluralRu(totalStudents, STUDENT_FORMS)}.
            </p>
          ) : null}
        </section>

        <section className="cm-panel">
          <h3>Распределение по прогрессу</h3>
          <p className="cm-panel-hint">Сколько студентов в каждом диапазоне</p>
          <div className="cm-histogram" role="list">
            {BUCKETS.map((label, index) => (
              <div
                key={label}
                className="cm-histogram-col"
                role="listitem"
                aria-label={`${label}: ${totals.buckets[index]}`}
              >
                <strong>{totals.buckets[index]}</strong>
                <i
                  style={{
                    height: `${Math.max(3, (totals.buckets[index] / maxBucket) * 100)}%`,
                  }}
                  className={totals.buckets[index] ? "" : "is-empty"}
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
