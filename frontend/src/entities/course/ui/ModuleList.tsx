import {
  PROGRESS_STATUS_LABELS,
  type ModuleProgressSummary,
} from "@/entities/progress/@x/course";

export interface ModuleListItem {
  id: string;
  order?: number;
  title?: string;
}

export interface ModuleListProps {
  modules: ModuleListItem[] | null | undefined;
  selectedModuleId?: string | null;
  disabled?: boolean;
  onSelectModule: (moduleId: string) => void;
  progressById?: Record<string, ModuleProgressSummary> | null;
}

export function ModuleList({
  modules,
  selectedModuleId,
  disabled,
  onSelectModule,
  progressById = null,
}: ModuleListProps) {
  if (!Array.isArray(modules) || modules.length === 0) {
    return (
      <article className="course-viewer-card course-viewer-side-card tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:0_20px_60px_rgba(27,_35,_68,_0.08)] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[*_&]:[background:rgba(19,_24,_42,_0.72)]">
        <h2>Модули</h2>
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
          В курсе пока нет модулей.
        </p>
      </article>
    );
  }

  return (
    <article className="course-viewer-card course-viewer-side-card tw:p-[24px]">
      <h2 className="tw:mb-[14px] tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em]">
        Модули
      </h2>
      {disabled && (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
          Содержимое модулей станет доступно после записи на курс.
        </p>
      )}
      <ul className="course-pick-list tw:grid tw:gap-[10px] tw:m-[0] tw:p-[0] tw:[list-style:none]">
        {modules.map((module, index) => {
          const isSelected = module.id === selectedModuleId;
          const progress = progressById?.[module.id];

          return (
            <li
              className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]"
              key={module.id}
            >
              <button
                type="button"
                className={`course-pick-item tw:items-start tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[16px] tw:text-[inherit] tw:cursor-pointer tw:grid tw:gap-[8px] tw:grid-cols-[auto_1fr] tw:p-[14px] tw:text-left tw:w-[100%] tw:text-[0.96rem] tw:leading-[1.45] tw:[border-width:1px] tw:[&.is-selected]:border-[var(--accent,_#6c63ff)] tw:[&.has-progress.is-in\_progress]:border-(--progress-active) tw:[&.has-progress.is-completed]:border-(--progress-done) tw:[background:var(--glass-bg-strong)] tw:disabled:cursor-not-allowed tw:[&.has-progress]:grid-cols-[auto_1fr_auto] tw:[transition:border-color_0.2s_ease,_transform_0.2s_ease,_background_0.2s_ease] tw:disabled:opacity-[0.64] tw:[&.is-selected]:[background:rgba(111,_119,_255,_0.14)] tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:border-[rgba(233,_222,_203,_0.16)] tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&.is-selected]:border-(--contrast) tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:text-(--text) tw:[&:not(:disabled):hover]:border-[var(--accent,_#6c63ff)] tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[background:rgba(233,_222,_203,_0.05)] tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&.is-selected]:[background:rgba(203,_170,_203,_0.12)] tw:[&.has-progress.is-in\_progress]:[&:not(:disabled):hover]:border-(--progress-active) tw:[&.has-progress.is-completed]:[&:not(:disabled):hover]:border-(--progress-done) tw:[&:not(:disabled):hover]:[transform:translateY(-1px)] tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:not(:disabled):hover]:border-(--accent) tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&.has-progress.is-in\_progress]:[&:not(:disabled):hover]:border-[rgba(233,_222,_203,_0.16)] tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&.has-progress.is-completed]:[&:not(:disabled):hover]:border-[rgba(233,_222,_203,_0.16)] tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:not(:disabled):hover]:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&.has-progress.is-in\_progress]:[&:not(:disabled):hover]:border-(--accent) tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:not(:disabled):hover]:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&.has-progress.is-completed]:[&:not(:disabled):hover]:border-(--accent) ${isSelected ? "is-selected" : ""} ${progress ? `has-progress is-${progress.status}` : ""}`}
                onClick={() => onSelectModule(module.id)}
                disabled={disabled}
              >
                {/* Номер по месту в списке: order с бэкенда начинается с 1. */}
                <span className="course-pick-order tw:text-(--ink-accent) tw:font-[800]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{module.title}</span>
                {progress && (
                  <span
                    className={`course-pick-progress tw:self-center tw:p-[2px_9px] tw:rounded-[999px] tw:text-(--muted) tw:text-[0.78rem] tw:font-[800] tw:whitespace-nowrap tw:[background:var(--progress-idle-bg)] tw:[&.is-in\_progress]:text-(--progress-active) tw:[&.is-completed]:text-(--progress-done) tw:[&.is-in\_progress]:[background:var(--progress-active-bg)] tw:[&.is-completed]:[background:var(--progress-done-bg)] is-${progress.status}`}
                  >
                    {progress.total > 0
                      ? `${progress.completed}/${progress.total}`
                      : PROGRESS_STATUS_LABELS[progress.status]}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
