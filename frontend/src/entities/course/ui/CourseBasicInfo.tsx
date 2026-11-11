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
    <article className="course-viewer-card course-basic-info tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[.course-enrollment-view_&]:border-solid tw:[.generated-course-learning-grid_&]:border-solid tw:[.course-enrollment-view_&]:border-[rgba(var(--accent-rgb),_0.34)] tw:[.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.34)] tw:dark:border-[rgba(255,_255,_255,_0.12)] tw:[.course-enrollment-view_&]:rounded-[14px] tw:[.generated-course-learning-grid_&]:rounded-[14px] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:0_20px_60px_rgba(27,_35,_68,_0.08)] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[.generated-course-learning-grid_&]:w-[100%] tw:[.course-enrollment-view_&]:[border-width:1px] tw:[.generated-course-learning-grid_&]:[border-width:1px] tw:dark:[.page_.course-enrollment-view_&]:border-[rgba(247,_220,_168,_0.34)] tw:dark:[.page_.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:[.course-enrollment-view_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg)] tw:[.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:dark:[background:rgba(19,_24,_42,_0.72)] tw:[.course-enrollment-view_&]:[box-shadow:none] tw:[.generated-course-learning-grid_&]:[box-shadow:none] tw:[.generated-course-learning-grid_&]:[-webkit-backdrop-filter:none] tw:[.generated-course-learning-grid_&]:[backdrop-filter:none] tw:dark:[.page_.course-enrollment-view_&]:text-[#f4ead8] tw:dark:[.page_.generated-course-learning-grid_&]:text-[#f4ead8] tw:no-backdrop-filter:[.course-enrollment-view_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.course-enrollment-view_&]:[background:var(--glass-fallback-bg)] tw:dark:[.page_.course-enrollment-view_&]:[background:linear-gradient(rgba(255,_255,_255,_0.08),_rgba(255,_255,_255,_0.08)),_var(--glass-bg)] tw:dark:[.page_.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)] tw:[&_h1]:m-[0] tw:dark:[.page_.course-enrollment-view_&_h2]:text-[#fff4df] tw:dark:[.page_.course-enrollment-view_&_h3]:text-[#fff4df] tw:dark:[.page_.course-enrollment-view_&_li]:text-[#e9decb] tw:dark:[.page_.generated-course-learning-grid_&_h2]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_&_h3]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_&_li]:text-[#e9decb]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#f7dca8] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#f7dca8]">
        Курс
      </div>
      <h1 className="tw:m-[0] tw:text-[clamp(1.8rem,_3.4vw,_2.75rem)] tw:leading-[1.18] tw:tracking-[-0.025em] tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#fff4df]">
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

      <div className="course-meta-grid tw:grid tw:grid-cols-[repeat(auto-fit,_minmax(140px,_1fr))] tw:gap-[12px] tw:mt-[20px]">
        <div className="tw:rounded-[18px] tw:p-[14px] tw:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:dark:[.page_.course-enrollment-view_.course-basic-info_.course-meta-grid_>_&]:[background:rgba(255,_255,_255,_0.08)] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_.course-meta-grid_>_&]:[background:linear-gradient(rgba(255,_255,_255,_0.08),_rgba(255,_255,_255,_0.08)),_var(--glass-bg-strong)] tw:dark:[.page_.course-enrollment-view_.course-basic-info_.course-meta-grid_>_&]:[border:1px_solid_rgba(247,_220,_168,_0.18)] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_.course-meta-grid_>_&]:[border:1px_solid_rgba(247,_220,_168,_0.18)]">
          <span className="tw:text-(--muted) tw:block tw:text-[0.84rem] tw:mb-[4px] tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#e9decb] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#e9decb]">
            Уровень
          </span>
          <strong className="tw:dark:[.page_.course-enrollment-view_.course-basic-info_&]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_&]:text-[#fff4df]">
            {difficulty}
          </strong>
        </div>
        <div className="tw:rounded-[18px] tw:p-[14px] tw:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:dark:[.page_.course-enrollment-view_.course-basic-info_.course-meta-grid_>_&]:[background:rgba(255,_255,_255,_0.08)] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_.course-meta-grid_>_&]:[background:linear-gradient(rgba(255,_255,_255,_0.08),_rgba(255,_255,_255,_0.08)),_var(--glass-bg-strong)] tw:dark:[.page_.course-enrollment-view_.course-basic-info_.course-meta-grid_>_&]:[border:1px_solid_rgba(247,_220,_168,_0.18)] tw:dark:[.page_.generated-course-learning-grid_.course-basic-info_.course-meta-grid_>_&]:[border:1px_solid_rgba(247,_220,_168,_0.18)]">
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
