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
      <article className="course-viewer-card course-viewer-side-card">
        <h2>Модули</h2>
        <p className="course-viewer-muted">В курсе пока нет модулей.</p>
      </article>
    );
  }

  return (
    <article className="course-viewer-card course-viewer-side-card">
      <h2>Модули</h2>
      {disabled && (
        <p className="course-viewer-muted">
          Содержимое модулей станет доступно после записи на курс.
        </p>
      )}
      <ul className="course-pick-list">
        {modules.map((module, index) => {
          const isSelected = module.id === selectedModuleId;
          const progress = progressById?.[module.id];

          return (
            <li key={module.id}>
              <button
                type="button"
                className={`course-pick-item ${isSelected ? "is-selected" : ""} ${progress ? `has-progress is-${progress.status}` : ""}`}
                onClick={() => onSelectModule(module.id)}
                disabled={disabled}
              >
                {/* Номер по месту в списке: order с бэкенда начинается с 1. */}
                <span className="course-pick-order">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{module.title}</span>
                {progress && (
                  <span
                    className={`course-pick-progress is-${progress.status}`}
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
