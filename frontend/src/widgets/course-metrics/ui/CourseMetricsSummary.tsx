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
    <div className="cm tw:flex tw:flex-col tw:gap-[16px] tw:min-w-[0] tw:text-(--text) tw:[--cm-panel:rgba(var(--accent-rgb),_0.06)] tw:[--cm-border:rgba(var(--accent-rgb),_0.28)] tw:[--cm-line:rgba(43,_43,_43,_0.1)] tw:[--cm-good:#1f8a4c] tw:[--cm-good-bg:#d9efe2] tw:[--cm-good-ink:#14653a] tw:[--cm-warn:#c98a12] tw:[--cm-warn-bg:#f6e7c4] tw:[--cm-warn-ink:#7a5300] tw:[--cm-bad:#c43c3c] tw:[--cm-bad-bg:#f6d9d6] tw:[--cm-bad-ink:#8f2121] tw:[--cm-depth:#2f5fc4] tw:[--cm-neutral-bg:rgba(43,_43,_43,_0.08)] tw:dark:[--cm-panel:rgba(255,_255,_255,_0.04)] tw:dark:[--cm-border:rgba(255,_255,_255,_0.12)] tw:dark:[--cm-line:rgba(255,_255,_255,_0.1)] tw:dark:[--cm-good:#4cc27f] tw:dark:[--cm-good-bg:rgba(76,_194,_127,_0.16)] tw:dark:[--cm-good-ink:#8fe0b2] tw:dark:[--cm-warn:#e3b341] tw:dark:[--cm-warn-bg:rgba(227,_179,_65,_0.16)] tw:dark:[--cm-warn-ink:#f1d08a] tw:dark:[--cm-bad:#f07070] tw:dark:[--cm-bad-bg:rgba(240,_112,_112,_0.16)] tw:dark:[--cm-bad-ink:#f7a9a9] tw:dark:[--cm-depth:#7ea6ff] tw:dark:[--cm-neutral-bg:rgba(255,_255,_255,_0.08)]">
      <div className="cm-toolbar tw:flex tw:flex-wrap tw:items-end tw:gap-[12px_16px]">
        <h2 className="tw:flex-[1_1_200px] tw:[&&&]:text-[1.4rem] tw:[&&&]:leading-[1.25]">
          Сводка по курсу
        </h2>
        <span className="cm-hint tw:text-(--muted) tw:text-[0.84rem] tw:leading-[1.4] tw:m-[0]">
          Прогресс считается по урокам, где пройдены теория, практика и
          проверочные вопросы.
        </span>
      </div>

      {studentsError || progress.error ? (
        <p
          className="cm-error tw:m-[0] tw:p-[10px_14px] tw:rounded-[12px] tw:text-(--cm-bad-ink) tw:font-[600] tw:[background:var(--cm-bad-bg)]"
          role="alert"
        >
          {studentsError || progress.error}
        </p>
      ) : null}

      <div className="cm-kpis tw:grid tw:grid-cols-[repeat(4,_minmax(0,_1fr))] tw:gap-[12px] tw:max-980:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:max-520:grid-cols-[minmax(0,_1fr)]">
        <article className="cm-kpi tw:flex tw:flex-col tw:items-start tw:gap-[3px] tw:min-w-[0] tw:p-[14px_16px] tw:rounded-[16px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
          <span className="tw:first:text-(--muted) tw:first:text-[0.82rem] tw:first:font-[700]">
            Студентов
          </span>
          <strong className="tw:text-(--heading) tw:text-[1.75rem] tw:leading-[1.15]">
            {isLoading ? "…" : totalStudents}
          </strong>
          <small className="tw:text-(--muted) tw:text-[0.8rem]">
            записаны на курс
          </small>
        </article>
        <article className="cm-kpi tw:flex tw:flex-col tw:items-start tw:gap-[3px] tw:min-w-[0] tw:p-[14px_16px] tw:rounded-[16px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
          <span className="tw:first:text-(--muted) tw:first:text-[0.82rem] tw:first:font-[700]">
            Средний прогресс
          </span>
          <strong className="tw:text-(--heading) tw:text-[1.75rem] tw:leading-[1.15]">
            {isLoading ? "…" : `${totals.average}%`}
          </strong>
          <small className="tw:text-(--muted) tw:text-[0.8rem]">
            по всем студентам
          </small>
        </article>
        <article className="cm-kpi tw:flex tw:flex-col tw:items-start tw:gap-[3px] tw:min-w-[0] tw:p-[14px_16px] tw:rounded-[16px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
          <span className="tw:first:text-(--muted) tw:first:text-[0.82rem] tw:first:font-[700]">
            Завершили курс
          </span>
          <strong className="tw:text-(--heading) tw:text-[1.75rem] tw:leading-[1.15]">
            {isLoading ? "…" : totals.completed}
          </strong>
          <small className="tw:text-(--muted) tw:text-[0.8rem]">
            {isLoading ? "" : `${completedShare}% студентов`}
          </small>
        </article>
        <article className="cm-kpi tw:flex tw:flex-col tw:items-start tw:gap-[3px] tw:min-w-[0] tw:p-[14px_16px] tw:rounded-[16px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
          <span className="tw:first:text-(--muted) tw:first:text-[0.82rem] tw:first:font-[700]">
            Не начали
          </span>
          <strong className="tw:text-(--heading) tw:text-[1.75rem] tw:leading-[1.15]">
            {isLoading ? "…" : totals.notStarted}
          </strong>
          <small className="tw:text-(--muted) tw:text-[0.8rem]">
            ещё не открывали курс
          </small>
        </article>
      </div>

      <div className="cm-row tw:flex tw:flex-wrap tw:gap-[14px] tw:items-stretch">
        <section className="cm-panel cm-panel-wide tw:flex-[3_1_520px] tw:min-w-[0] tw:flex tw:flex-col tw:gap-[6px] tw:p-[16px_18px] tw:rounded-[18px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
          <h3 className="tw:text-[1rem] tw:leading-[1.3] tw:tracking-[-0.008em]">
            Студенты
          </h3>
          <p className="cm-panel-hint tw:text-(--muted) tw:m-[0] tw:[&&&]:text-[0.84rem] tw:[&&&]:leading-[1.4]">
            Сортировка по прогрессу. Нажмите на студента, чтобы открыть его
            метрики по урокам.
          </p>
          {isLoading && rows.length === 0 ? (
            <p className="cm-empty tw:m-[0] tw:text-(--muted) tw:[&&&]:text-[0.95rem] tw:[&&&]:leading-[1.5]">
              Загружаем студентов…
            </p>
          ) : rows.length === 0 ? (
            <p className="cm-empty tw:m-[0] tw:text-(--muted)">
              На курс пока никто не записан.
            </p>
          ) : (
            <div className="cm-table-scroll tw:overflow-x-auto">
              <table className="cm-table tw:w-[100%] tw:min-w-[520px] tw:text-[0.92rem] tw:[border-collapse:collapse]">
                <thead>
                  <tr>
                    <th
                      className="tw:p-[8px_6px] tw:text-(--muted) tw:text-[0.74rem] tw:font-[800] tw:tracking-[0.05em] tw:text-left tw:uppercase tw:[border-bottom:1px_solid_var(--cm-line)]"
                      scope="col"
                    >
                      Студент
                    </th>
                    <th
                      className="tw:p-[8px_6px] tw:text-(--muted) tw:text-[0.74rem] tw:font-[800] tw:tracking-[0.05em] tw:text-left tw:uppercase tw:[border-bottom:1px_solid_var(--cm-line)]"
                      scope="col"
                    >
                      Прогресс курса
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
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className="is-clickable tw:cursor-pointer"
                      onClick={() => onOpenStudent?.(row.userId)}
                    >
                      <td className="tw:p-[10px_6px] tw:text-(--text) tw:align-middle tw:[border-bottom:1px_solid_var(--cm-line)] tw:[.cm-table_tr:last-child_&]:[border-bottom:0] tw:[.cm-table_tr.is-clickable:hover_&]:[background:rgba(var(--accent-rgb),_0.1)]">
                        <button
                          type="button"
                          className="cm-person tw:flex tw:items-center tw:gap-[10px] tw:p-[0] tw:text-[inherit] tw:text-left tw:cursor-pointer tw:[border:0] tw:[background:none] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenStudent?.(row.userId);
                          }}
                        >
                          <span
                            className="cm-avatar tw:flex-[none] tw:grid tw:w-[34px] tw:h-[34px] tw:overflow-hidden tw:rounded-[50%] tw:text-(--heading) tw:text-[0.74rem] tw:font-[800] tw:[place-items:center] tw:[background:rgba(var(--accent-rgb),_0.28)] tw:[&_img]:w-[100%] tw:[&_img]:h-[100%] tw:[&_img]:object-cover"
                            aria-hidden="true"
                          >
                            {row.avatarUrl ? (
                              <img src={row.avatarUrl} alt="" />
                            ) : (
                              getInitials(row.name)
                            )}
                          </span>
                          <span className="cm-person-text tw:flex tw:flex-col tw:min-w-[0]">
                            <strong className="tw:text-(--heading)">
                              {row.name}
                            </strong>
                            {row.email ? (
                              <small className="tw:text-(--muted) tw:text-[0.78rem]">
                                {row.email}
                              </small>
                            ) : null}
                          </span>
                        </button>
                      </td>
                      <td className="tw:p-[10px_6px] tw:text-(--text) tw:align-middle tw:[border-bottom:1px_solid_var(--cm-line)] tw:[.cm-table_tr:last-child_&]:[border-bottom:0] tw:[.cm-table_tr.is-clickable:hover_&]:[background:rgba(var(--accent-rgb),_0.1)]">
                        <div className="cm-meter tw:flex tw:items-center tw:gap-[10px]">
                          <div
                            className="cm-bar tw:flex-[1_1_140px] tw:h-[8px] tw:overflow-hidden tw:rounded-[99px] tw:[background:var(--cm-neutral-bg)]"
                            role="progressbar"
                            aria-label={`Прогресс ${row.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={row.percent}
                          >
                            <i
                              className={`tw:block tw:h-[100%] tw:rounded-[inherit] tw:[.cm_&.is-good:is(.cm-bar_i,i.cm-chart-bar,.cm-legend_i)]:[background:var(--cm-good)] tw:[.cm_&.is-danger:is(.cm-bar_i,i.cm-chart-bar)]:[background:var(--cm-bad)] tw:[.cm_&.is-warning:is(.cm-bar_i,i.cm-chart-bar)]:[background:var(--cm-warn)] ${percentTone(row.percent) ?? ""}`}
                              style={{ width: `${row.percent}%` }}
                            />
                          </div>
                          <b className="tw:min-w-[42px] tw:text-(--heading) tw:text-[0.9rem]">
                            {row.percent}%
                          </b>
                        </div>
                      </td>
                      <td className="tw:p-[10px_6px] tw:text-(--text) tw:align-middle tw:[border-bottom:1px_solid_var(--cm-line)] tw:[.cm-table_tr:last-child_&]:[border-bottom:0] tw:[.cm-table_tr.is-clickable:hover_&]:[background:rgba(var(--accent-rgb),_0.1)]">
                        <span
                          className={`cm-pill tw:inline-block tw:p-[3px_10px] tw:rounded-[99px] tw:text-[0.76rem] tw:font-[800] tw:whitespace-nowrap tw:[&.is-good]:text-(--cm-good-ink) tw:[&.is-warning]:text-(--cm-warn-ink) tw:[&.is-neutral]:text-(--muted) tw:[&.is-good]:[background:var(--cm-good-bg)] tw:[&.is-warning]:[background:var(--cm-warn-bg)] tw:[&.is-neutral]:[background:var(--cm-neutral-bg)] ${row.status.tone}`}
                        >
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
            <p className="cm-panel-hint tw:text-(--muted) tw:text-[0.84rem] tw:leading-[1.4] tw:[.page_.cm_&]:m-[0]">
              Показаны первые {rows.length} из {totalStudents}{" "}
              {pluralRu(totalStudents, STUDENT_FORMS)}.
            </p>
          ) : null}
        </section>

        <section className="cm-panel tw:flex-[2_1_300px] tw:min-w-[0] tw:flex tw:flex-col tw:gap-[6px] tw:p-[16px_18px] tw:rounded-[18px] tw:[border:1px_solid_var(--cm-border)] tw:[background:var(--cm-panel)]">
          <h3 className="tw:text-[1rem] tw:leading-[1.3] tw:tracking-[-0.008em]">
            Распределение по прогрессу
          </h3>
          <p className="cm-panel-hint tw:text-(--muted) tw:m-[0] tw:[&&&]:text-[0.84rem] tw:[&&&]:leading-[1.4]">
            Сколько студентов в каждом диапазоне
          </p>
          <div
            className="cm-histogram tw:flex-[1_1_auto] tw:grid tw:grid-cols-[repeat(4,_minmax(0,_1fr))] tw:gap-[12px] tw:min-h-[190px] tw:pt-[8px]"
            role="list"
          >
            {BUCKETS.map((label, index) => (
              <div
                key={label}
                className="cm-histogram-col tw:grid tw:grid-rows-[auto_1fr_auto] tw:gap-[6px] tw:min-w-[0] tw:[justify-items:center]"
                role="listitem"
                aria-label={`${label}: ${totals.buckets[index]}`}
              >
                <strong className="tw:text-(--heading)">
                  {totals.buckets[index]}
                </strong>
                <i
                  style={{
                    height: `${Math.max(3, (totals.buckets[index] / maxBucket) * 100)}%`,
                  }}
                  className={`tw:w-[70%] tw:rounded-[8px_8px_3px_3px] tw:[align-self:end] tw:[background:rgba(var(--accent-rgb),_0.85)] tw:[.cm-histogram-col_&.is-empty]:[background:rgba(var(--accent-rgb),_0.3)] ${totals.buckets[index] ? "" : "is-empty"}`}
                />
                <span className="tw:text-(--muted) tw:text-[0.76rem] tw:whitespace-nowrap">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
