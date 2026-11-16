import {
  PROGRESS_STATUS_LABELS,
  type ModuleProgressSummary,
} from '@/entities/progress/@x/course';

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
      <article className="course-viewer-document module-list tw:min-w-0 tw:w-full tw:text-(--text) tw:[&_h1]:m-0 tw:mt-[28px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line) tw:pt-[24px]">
        <h2>Модули</h2>
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
          В курсе пока нет модулей.
        </p>
      </article>
    );
  }

  return (
    <article className="course-viewer-document module-list tw:min-w-0 tw:w-full tw:text-(--text) tw:[&_h1]:m-0 tw:mt-[28px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line) tw:pt-[24px]">
      <h2 className="tw:mb-[14px] tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em]">
        Модули
      </h2>
      {disabled && (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
          Содержимое модулей станет доступно после записи на курс.
        </p>
      )}
      <ul className="course-pick-list tw:grid tw:gap-0 tw:m-0 tw:p-0 tw:list-none">
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
                className={String.raw`course-pick-item tw:grid tw:grid-cols-[auto_minmax(0,1fr)_auto] tw:items-start tw:gap-[12px] tw:w-full tw:border-0 tw:border-b tw:border-solid tw:border-(--line) tw:bg-transparent tw:px-[4px] tw:py-[16px] tw:text-left tw:text-[16px] tw:leading-[1.5] tw:text-(--text) tw:[font-family:inherit] tw:cursor-pointer tw:hover:text-(--contrast) tw:focus-visible:outline-2 tw:focus-visible:outline-(--contrast) tw:disabled:cursor-not-allowed tw:disabled:opacity-60 ${isSelected ? 'is-selected' : ''} ${progress ? `has-progress is-${progress.status}` : ''}`}
                onClick={() => onSelectModule(module.id)}
                disabled={disabled}
              >
                {/* Номер по месту в списке: order с бэкенда начинается с 1. */}
                <span className="course-pick-order tw:text-(--ink-accent) tw:font-[800]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{module.title}</span>
                {progress && (
                  <span
                    className={String.raw`course-pick-progress tw:self-center tw:p-[2px_9px] tw:rounded-[999px] tw:text-(--muted) tw:text-[0.78rem] tw:font-[800] tw:whitespace-nowrap tw:[background:var(--progress-idle-bg)] tw:[&.is-in\_progress]:text-(--progress-active) tw:[&.is-completed]:text-(--progress-done) tw:[&.is-in\_progress]:[background:var(--progress-active-bg)] tw:[&.is-completed]:[background:var(--progress-done-bg)] is-${progress.status}`}
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
