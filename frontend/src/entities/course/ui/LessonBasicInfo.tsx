export interface LessonBasicInfoData {
  id?: string;
  order: number;
  title?: string;
  description?: string;
  estimated_time_minutes?: number | null;
  learningObjectives?: string[];
  learning_objectives?: string[];
}

export function LessonBasicInfo({
  lesson,
}: {
  lesson: LessonBasicInfoData | null | undefined;
}) {
  if (!lesson) {
    return (
      <article className="course-viewer-card tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:0_20px_60px_rgba(27,_35,_68,_0.08)] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[.generated-course-learning-grid_&]:w-[100%] tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[*_&]:[background:rgba(19,_24,_42,_0.72)] tw:[&_h1]:m-[0]">
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
          Выберите урок, чтобы увидеть описание.
        </p>
      </article>
    );
  }

  const learningObjectives = Array.isArray(lesson.learningObjectives)
    ? lesson.learningObjectives
    : Array.isArray(lesson.learning_objectives)
      ? lesson.learning_objectives
      : [];

  return (
    <article className="course-viewer-card lesson-basic-info tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[14px] tw:p-[24px] tw:w-[100%] tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[box-shadow:none] tw:[-webkit-backdrop-filter:none] tw:[backdrop-filter:none] tw:dark:text-[#f4ead8] tw:dark:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)] tw:[&_h1]:m-[0] tw:dark:[.page_.generated-course-learning-grid_&_h3]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_&_li]:text-[#e9decb]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:text-[#f7dca8]">
        Урок {lesson.order + 1}
      </div>
      <h2 className="tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em] tw:dark:text-[#fff4df]">
        {lesson.title}
      </h2>
      {lesson.description ? (
        <p className="course-viewer-description tw:text-(--muted) tw:leading-[1.72] tw:m-[14px_0_0] tw:text-[1rem] tw:tracking-[0.012em] tw:dark:text-[#e9decb]">
          {lesson.description}
        </p>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.72] tw:m-[10px_0_0] tw:text-[1rem] tw:tracking-[0.012em] tw:dark:text-[#e9decb]">
          Описание урока отсутствует.
        </p>
      )}

      <div className="course-meta-grid tw:grid tw:grid-cols-[repeat(auto-fit,_minmax(140px,_1fr))] tw:gap-[12px] tw:mt-[20px]">
        <div className="tw:rounded-[18px] tw:p-[14px] tw:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:dark:[background:linear-gradient(rgba(255,_255,_255,_0.08),_rgba(255,_255,_255,_0.08)),_var(--glass-bg-strong)] tw:dark:[border:1px_solid_rgba(247,_220,_168,_0.18)]">
          <span className="tw:text-(--muted) tw:block tw:text-[0.84rem] tw:mb-[4px] tw:dark:text-[#e9decb]">
            Время
          </span>
          <strong className="tw:dark:text-[#fff4df]">
            {lesson.estimated_time_minutes === null
              ? 'Не указано'
              : `${lesson.estimated_time_minutes} мин.`}
          </strong>
        </div>
      </div>

      {learningObjectives.length > 0 ? (
        <div className="course-info-section tw:mt-[22px]">
          <h3>Цели урока</h3>
          <ul className="course-viewer-list tw:grid tw:gap-[8px] tw:m-[12px_0_0] tw:pl-[20px]">
            {learningObjectives.map((objective, index) => (
              <li key={`${lesson.id}-objective-${index}`}>{objective}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.72] tw:m-[10px_0_0] tw:text-[1rem] tw:tracking-[0.012em] tw:dark:text-[#e9decb]">
          Цели урока пока не указаны.
        </p>
      )}
    </article>
  );
}
