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
      <article className="course-viewer-document module-basic-info tw:min-w-0 tw:w-full tw:text-(--text) tw:[&_h1]:m-0">
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
    <article className="course-viewer-document module-basic-info tw:min-w-0 tw:w-full tw:text-(--text) tw:[&_h1]:m-0">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:text-[#f7dca8]">
        Модуль {module.order + 1}
      </div>
      <h2 className="tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em] tw:dark:text-[#fff4df]">
        {module.title}
      </h2>
      {module.description ? (
        <p className="course-viewer-description tw:text-(--muted) tw:leading-[1.72] tw:m-[14px_0_0] tw:text-[1rem] tw:tracking-[0.012em] tw:dark:text-[#e9decb]">
          {module.description}
        </p>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.72] tw:m-[10px_0_0] tw:text-[1rem] tw:tracking-[0.012em] tw:dark:text-[#e9decb]">
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
                className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:dark:text-[#e9decb]"
                key={`${module.id}-objective-${index}`}
              >
                {objective}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.72] tw:m-[10px_0_0] tw:text-[1rem] tw:tracking-[0.012em] tw:dark:text-[#e9decb]">
          Цели модуля пока не указаны.
        </p>
      )}
    </article>
  );
}
