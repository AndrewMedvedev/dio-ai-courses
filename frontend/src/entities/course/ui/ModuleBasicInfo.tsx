export interface ModuleBasicInfoData {
  id?: string;
  order: number;
  title?: string;
  description?: string;
  learningObjectives?: string[];
  learning_objectives?: string[];
}

export function ModuleBasicInfo({
  module,
}: {
  module: ModuleBasicInfoData | null | undefined;
}) {
  if (!module) {
    return (
      <article className="course-viewer-card tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:0_20px_60px_rgba(27,_35,_68,_0.08)] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[*_&]:[background:rgba(19,_24,_42,_0.72)] tw:[&_h1]:m-[0]">
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
          Выберите модуль, чтобы увидеть описание.
        </p>
      </article>
    );
  }

  const learningObjectives = Array.isArray(module.learningObjectives)
    ? module.learningObjectives
    : Array.isArray(module.learning_objectives)
      ? module.learning_objectives
      : [];

  return (
    <article className="course-viewer-card module-basic-info tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[14px] tw:p-[24px] tw:w-[100%] tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[box-shadow:none] tw:[-webkit-backdrop-filter:none] tw:[backdrop-filter:none] tw:dark:text-[#f4ead8] tw:dark:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)] tw:[&_h1]:m-[0] tw:dark:[.page_.generated-course-learning-grid_&_strong]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_&_span]:text-[#e9decb]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:text-[#f7dca8]">
        Модуль {module.order + 1}
      </div>
      <h2 className="tw:dark:text-[#fff4df]">{module.title}</h2>
      {module.description ? (
        <p className="course-viewer-description tw:text-(--muted) tw:m-[14px_0_0] tw:dark:text-[#e9decb]">
          {module.description}
        </p>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:m-[10px_0_0] tw:dark:text-[#e9decb]">
          Описание модуля отсутствует.
        </p>
      )}

      {learningObjectives.length > 0 ? (
        <div className="course-info-section tw:mt-[22px]">
          <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em] tw:dark:text-[#fff4df]">
            Цели модуля
          </h3>
          <ul className="course-viewer-list tw:grid tw:gap-[8px] tw:m-[12px_0_0] tw:pl-[20px]">
            {learningObjectives.map((objective, index) => (
              <li
                className="tw:dark:text-[#e9decb]"
                key={`${module.id}-objective-${index}`}
              >
                {objective}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:m-[10px_0_0] tw:dark:text-[#e9decb]">
          Цели модуля пока не указаны.
        </p>
      )}
    </article>
  );
}
