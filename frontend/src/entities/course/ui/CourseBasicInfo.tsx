import { formatCourseLevel } from '../model/levels';

export interface CourseBasicInfoData {
  title?: string;
  description?: string;
  blocks?: unknown[];
  modules?: unknown[];
  learningObjectives?: string[];
  learning_objectives?: string[];
  difficulty?: string;
  level?: string;
  tags?: string[];
}

interface TextListProps {
  title: string;
  items: string[];
  emptyText: string;
}

function TextList({ title, items, emptyText }: TextListProps) {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.72] tw:m-[10px_0_0] tw:text-[1rem] tw:tracking-[0.012em] tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#e9decb] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#e9decb]">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="course-info-section tw:mt-[22px]">
      <h3>{title}</h3>
      <ul className="course-viewer-list tw:grid tw:gap-[8px] tw:m-[12px_0_0] tw:pl-[20px]">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function CourseBasicInfo({
  course,
}: {
  course: CourseBasicInfoData | null | undefined;
}) {
  if (!course) {
    return (
      <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
        Информация о курсе недоступна.
      </p>
    );
  }

  const modules = Array.isArray(course.blocks)
    ? course.blocks
    : Array.isArray(course.modules)
      ? course.modules
      : [];
  const learningObjectives = Array.isArray(course.learningObjectives)
    ? course.learningObjectives
    : Array.isArray(course.learning_objectives)
      ? course.learning_objectives
      : [];
  const difficulty = formatCourseLevel(course.difficulty || course.level);

  return (
    <article className="course-viewer-document course-basic-info tw:min-w-0 tw:w-full tw:text-(--text) tw:[&_h1]:m-0">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#f7dca8] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#f7dca8]">
        Курс
      </div>
      <h1 className="tw:m-[0] tw:max-w-[38ch] tw:text-[clamp(1.5rem,_2.3vw,_2.25rem)] tw:leading-[1.3] tw:[text-wrap:balance] tw:[overflow-wrap:break-word] tw:tracking-[-0.025em] tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#fff4df]">
        {course.title}
      </h1>
      {course.description ? (
        <p className="course-viewer-description tw:text-(--muted) tw:leading-[1.72] tw:m-[14px_0_0] tw:text-[1rem] tw:tracking-[0.012em] tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#e9decb] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#e9decb]">
          {course.description}
        </p>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
          Описание курса пока отсутствует.
        </p>
      )}

      <div className="course-meta-grid tw:grid tw:grid-cols-[repeat(auto-fit,_minmax(140px,_1fr))] tw:gap-[24px] tw:my-[24px] tw:border-0 tw:border-y tw:border-solid tw:border-(--line) tw:py-[18px]">
        <div className="tw:min-w-0">
          <span className="tw:text-(--muted) tw:block tw:text-[0.84rem] tw:mb-[4px] tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#e9decb] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#e9decb]">
            Уровень
          </span>
          <strong className="tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#fff4df]">
            {difficulty}
          </strong>
        </div>
        <div className="tw:min-w-0">
          <span className="tw:text-(--muted) tw:block tw:text-[0.84rem] tw:mb-[4px] tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#e9decb] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#e9decb]">
            Модулей
          </span>
          <strong className="tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#fff4df]">
            {modules.length}
          </strong>
        </div>
      </div>

      {(course.tags?.length ?? 0) > 0 && (
        <div
          className="course-tags tw:flex tw:flex-wrap tw:gap-[8px] tw:mt-[18px] tw:[&_span]:rounded-[999px] tw:[&_span]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)] tw:[&_span]:text-(--ink-accent) tw:[&_span]:text-[0.86rem] tw:[&_span]:font-[700] tw:[&_span]:p-[7px_12px]"
          aria-label="Теги курса"
        >
          {course.tags?.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}

      <TextList
        title="Цели обучения"
        items={learningObjectives}
        emptyText="Цели обучения пока не указаны."
      />
    </article>
  );
}
