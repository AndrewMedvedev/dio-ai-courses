import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SectionTop } from "@/shared/ui/section-top";
import {
  useModelStore,
  type AiModel,
  type ModelForm,
} from "@/entities/ai-model";
import type { ValidationErrors } from "@/shared/api";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="model-field-error tw:text-[#b42318] tw:text-[0.78rem] tw:font-[700]">
      {message}
    </span>
  ) : null;
}

interface ModelFormProps {
  form: ModelForm;
  validationErrors: ValidationErrors;
  isCreating: boolean;
  onChange: (field: keyof ModelForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

function ModelFormView({
  form,
  validationErrors,
  isCreating,
  onChange,
  onSubmit,
  onCancel,
}: ModelFormProps) {
  return (
    <form
      className="model-form tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:max-760:grid-cols-[1fr] tw:[align-items:end] tw:[&_label]:grid tw:[&_label]:gap-[7px] tw:[&_label_>_span]:text-(--text) tw:[&_label_>_span]:text-[0.82rem] tw:[&_label_>_span]:font-[800] tw:[&_input]:w-[100%] tw:[&_input]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_input]:[background:rgba(var(--accent-rgb),_0.08)] tw:[&_input]:rounded-[12px] tw:[&_input]:p-[11px_12px] tw:[&_input]:[font:inherit] tw:[&_input]:text-(--text) tw:[&_input]:[outline:none] tw:[&_textarea]:w-[100%] tw:[&_textarea]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_textarea]:[background:rgba(var(--accent-rgb),_0.08)] tw:[&_textarea]:rounded-[12px] tw:[&_textarea]:p-[11px_12px] tw:[&_textarea]:[font:inherit] tw:[&_textarea]:text-(--text) tw:[&_textarea]:[outline:none] tw:[&_textarea]:min-h-[92px] tw:[&_textarea]:resize-y tw:[&_input:focus]:border-[rgba(var(--accent-rgb),_0.82)] tw:[&_input:focus]:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.12)] tw:[&_textarea:focus]:border-[rgba(var(--accent-rgb),_0.82)] tw:[&_textarea:focus]:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.12)] tw:dark:[.page_&_input]:text-(--heading) tw:dark:[.page_&_input]:[background:rgba(24,_24,_24,_0.75)] tw:dark:[.page_&_input]:border-[rgba(var(--accent-rgb),_0.56)] tw:dark:[.page_&_textarea]:text-(--heading) tw:dark:[.page_&_textarea]:[background:rgba(24,_24,_24,_0.75)] tw:dark:[.page_&_textarea]:border-[rgba(var(--accent-rgb),_0.56)]"
      onSubmit={onSubmit}
    >
      <label>
        <span>Название</span>
        <input
          value={form.name}
          maxLength={255}
          onChange={(event) => onChange("name", event.target.value)}
          required
        />
        <FieldError message={validationErrors.name} />
      </label>
      <label className="model-form-wide tw:col-[1_/_-1]">
        <span>Описание</span>
        <textarea
          value={form.description}
          onChange={(event) => onChange("description", event.target.value)}
        />
        <FieldError message={validationErrors.description} />
      </label>
      <label className="model-form-wide tw:col-[1_/_-1]">
        <span>Контекст</span>
        <textarea
          className="model-context-input tw:[.model-form_&]:min-h-[150px]"
          value={form.context}
          onChange={(event) => onChange("context", event.target.value)}
        />
        <FieldError message={validationErrors.context} />
      </label>
      <FieldError message={validationErrors.form} />
      <div className="model-form-actions model-form-wide tw:flex tw:items-center tw:justify-start tw:flex-wrap tw:gap-[10px] tw:col-[1_/_-1]">
        <button
          type="submit"
          className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
          disabled={isCreating}
        >
          {isCreating ? "Создаём..." : "Создать модель"}
        </button>
        <button
          type="button"
          className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
          disabled={isCreating}
          onClick={onCancel}
        >
          Очистить
        </button>
      </div>
    </form>
  );
}

function splitModelDescription(
  description = "",
): { label: string; value: string }[] {
  const text = description.trim();
  if (!text) return [];

  const matches = Array.from(text.matchAll(/([A-Z_]{2,}):\s*/g));
  if (matches.length === 0) {
    return [{ label: "Описание", value: text }];
  }

  return matches
    .map((match, index) => {
      const nextMatch = matches[index + 1];
      const valueStart = (match.index ?? 0) + match[0].length;
      const valueEnd = nextMatch?.index ?? text.length;
      return {
        label: match[1].replaceAll("_", " "),
        value: text.slice(valueStart, valueEnd).replace(/^[-—.\s]+|\s+$/g, ""),
      };
    })
    .filter((item) => item.value);
}

function ModelDescription({ description }: { description?: string }) {
  const parts = splitModelDescription(description);

  if (parts.length === 0) {
    return (
      <p className="model-description-empty tw:m-[0] tw:text-(--muted)">
        Описание не заполнено.
      </p>
    );
  }

  return (
    <div className="model-description-grid tw:grid tw:grid-cols-[repeat(auto-fit,_minmax(210px,_1fr))] tw:gap-[10px]">
      {parts.map((part) => (
        <section
          key={part.label}
          className="model-description-item tw:min-w-[0] tw:rounded-[14px] tw:p-[11px_12px] tw:grid tw:gap-[6px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.22)] tw:[background:rgba(var(--accent-rgb),_0.06)] tw:[&_p]:m-[0] tw:[&_span]:text-(--muted) tw:[&_span]:text-[0.72rem] tw:[&_span]:font-[900] tw:[&_span]:tracking-[0.04em] tw:[&_span]:uppercase tw:[&_p]:text-(--text) tw:[&_p]:leading-[1.45]"
        >
          <span>{part.label}</span>
          <p>{part.value}</p>
        </section>
      ))}
    </div>
  );
}

function ModelCard({
  model,
  canDeleteModel,
  deletingUid,
  onDelete,
}: {
  model: AiModel;
  canDeleteModel: boolean;
  deletingUid: string | null;
  onDelete: (model: AiModel) => void;
}) {
  const isDeleting = deletingUid === model.uid;

  return (
    <article className="model-card tw:grid tw:gap-[18px] tw:rounded-[18px] tw:p-[18px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[background:rgba(var(--accent-rgb),_0.05)] tw:[&_h4]:m-[0] tw:[&_h4]:text-(--heading)">
      <div className="model-card-summary tw:flex tw:items-start tw:justify-between tw:flex-wrap tw:gap-[16px] tw:max-760:flex-col">
        <div className="model-card-title tw:min-w-[0] tw:grid tw:gap-[8px] tw:[&_p]:text-(--muted)">
          <span className="model-kicker tw:text-(--muted) tw:inline-flex tw:mb-[6px] tw:text-[0.78rem] tw:font-[800] tw:tracking-[0.03em] tw:uppercase">
            AIModel
          </span>
          <h4>{model.name}</h4>
        </div>
        {canDeleteModel && (
          <button
            type="button"
            className="btn btn-outline model-danger-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(180,_35,_24,_0.34)] tw:font-[700] tw:tracking-[0.01em] tw:text-[#b42318] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
            disabled={isDeleting}
            onClick={() => onDelete(model)}
          >
            {isDeleting ? "Удаляем..." : "Удалить"}
          </button>
        )}
      </div>
      <ModelDescription description={model.description} />
      {model.context && (
        <div className="model-card-footer tw:flex tw:items-center tw:flex-wrap tw:gap-[10px]">
          <div
            className="model-context-chip tw:max-w-[100%] tw:rounded-[999px] tw:p-[8px_11px] tw:inline-flex tw:items-center tw:gap-[8px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.24)] tw:[background:rgba(var(--accent-rgb),_0.07)] tw:[&_span]:text-(--muted) tw:[&_span]:text-[0.72rem] tw:[&_span]:font-[900] tw:[&_span]:tracking-[0.04em] tw:[&_span]:uppercase tw:[&_strong]:text-(--text) tw:[&_strong]:text-[0.88rem] tw:[&_strong]:overflow-hidden tw:[&_strong]:text-ellipsis tw:[&_strong]:whitespace-nowrap"
            title="Контекстное окно модели"
          >
            <span>Контекст</span>
            <strong>{model.context}</strong>
          </div>
        </div>
      )}
    </article>
  );
}

export interface ModelsPageProps {
  canCreateModel?: boolean;
  canDeleteModel?: boolean;
}

/** Список AI-моделей с созданием и удалением по правам. */
export function ModelsPage({
  canCreateModel = false,
  canDeleteModel = false,
}: ModelsPageProps) {
  const items = useModelStore((state) => state.items);
  const page = useModelStore((state) => state.page);
  const size = useModelStore((state) => state.size);
  const total = useModelStore((state) => state.total);
  const totalPages = useModelStore((state) => state.totalPages);
  const isLoading = useModelStore((state) => state.isLoading);
  const isCreating = useModelStore((state) => state.isCreating);
  const deletingUid = useModelStore((state) => state.deletingUid);
  const error = useModelStore((state) => state.error);
  const notice = useModelStore((state) => state.notice);
  const validationErrors = useModelStore((state) => state.validationErrors);
  const createForm = useModelStore((state) => state.createForm);
  const setPage = useModelStore((state) => state.setPage);
  const updateCreateField = useModelStore((state) => state.updateCreateField);
  const resetCreateForm = useModelStore((state) => state.resetCreateForm);
  const clearMessages = useModelStore((state) => state.clearMessages);
  const setNotice = useModelStore((state) => state.setNotice);
  const fetchModels = useModelStore((state) => state.fetchModels);
  const createModel = useModelStore((state) => state.createModel);
  const deleteModel = useModelStore((state) => state.deleteModel);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const pages = useMemo(
    () =>
      Array.from({ length: Math.max(1, totalPages) }, (_, index) => index + 1),
    [totalPages],
  );

  useEffect(() => {
    fetchModels(page, size).catch(() => {});
  }, [fetchModels, page, size]);

  useEffect(() => {
    if (!notice && !error) return undefined;

    const timeoutId = window.setTimeout(() => {
      clearMessages();
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [notice, error, clearMessages]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateModel || isCreating) return;

    try {
      await createModel(createForm);
      setShowCreateForm(false);
    } catch {
      // Ошибка уже переложена в store для отображения в UI.
    }
  };

  const handleDelete = async (model: AiModel) => {
    if (!canDeleteModel || !model?.uid || deletingUid) return;

    const confirmed = window.confirm(
      `Удалить AI-модель «${model.name || model.uid}»? Это действие нельзя отменить.`,
    );
    if (!confirmed) return;

    try {
      await deleteModel(model.uid);
    } catch {
      // Ошибка уже переложена в store для отображения в UI.
    }
  };

  const openCreateForm = () => {
    if (!canCreateModel) return;
    clearMessages();
    setShowCreateForm(true);
  };

  const cancelCreate = () => {
    resetCreateForm();
    setShowCreateForm(false);
    setNotice("");
  };

  return (
    <section className="container section models-page tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:grid tw:gap-[22px] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]">
      <SectionTop label="AI-модели" title="Управление AI-моделями" />
      <p className="courses-catalog-intro tw:max-w-[820px] tw:m-[18px_0_0] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
        Просмотр списка доступен авторизованным пользователям. Создание и
        удаление отображаются только при наличии соответствующих permissions.
      </p>

      {(notice || error) && (
        <article
          className={`glass-card model-message tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[16px_18px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] tw:[&_p]:m-[0] tw:[&_p]:text-(--success-text) tw:[&_p]:font-[700] tw:[&.is-error_p]:text-[#b42318] ${error ? "is-error" : ""}`}
        >
          <p>{error || notice}</p>
        </article>
      )}

      <article className="glass-card model-panel tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:grid tw:gap-[18px] tw:p-[24px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] tw:[&_h4]:m-[0] tw:[&_h4]:text-(--heading)">
        <div className="model-panel-head tw:flex tw:items-start tw:justify-between tw:flex-wrap tw:gap-[16px] tw:max-760:flex-col">
          <div>
            <span className="model-kicker tw:text-(--muted) tw:inline-flex tw:mb-[6px] tw:text-[0.78rem] tw:font-[800] tw:tracking-[0.03em] tw:uppercase">
              /ai/models
            </span>
            <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em]">
              Список моделей
            </h3>
            <p className="model-muted tw:text-(--muted) tw:m-[0] tw:font-[700] tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
              Всего: {total}
            </p>
          </div>
          {canCreateModel && !showCreateForm && (
            <button
              type="button"
              className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
              onClick={openCreateForm}
            >
              Создать модель
            </button>
          )}
        </div>

        {showCreateForm && canCreateModel && (
          <div className="model-create-box tw:grid tw:gap-[18px] tw:rounded-[18px] tw:p-[18px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[background:rgba(var(--accent-rgb),_0.05)]">
            <div className="model-panel-head tw:flex tw:items-start tw:justify-between tw:flex-wrap tw:gap-[16px] tw:max-760:flex-col">
              <h4>Новая AI-модель</h4>
              <button
                type="button"
                className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                disabled={isCreating}
                onClick={cancelCreate}
              >
                Закрыть
              </button>
            </div>
            <ModelFormView
              form={createForm}
              validationErrors={validationErrors}
              isCreating={isCreating}
              onChange={updateCreateField}
              onSubmit={handleCreate}
              onCancel={resetCreateForm}
            />
          </div>
        )}

        {isLoading && (
          <p className="model-muted tw:text-(--muted) tw:m-[0] tw:font-[700]">
            Загружаем AI-модели...
          </p>
        )}
        {!isLoading && items.length === 0 && !error && (
          <p className="model-muted tw:text-(--muted) tw:m-[0] tw:font-[700] tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
            AI-модели пока не найдены.
          </p>
        )}

        {!isLoading && items.length > 0 && (
          <div className="model-list tw:grid tw:gap-[16px]">
            {items.map((model) => (
              <ModelCard
                key={model.uid}
                model={model}
                canDeleteModel={canDeleteModel}
                deletingUid={deletingUid}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav
            className="courses-pagination tw:mt-[22px] tw:flex tw:items-center tw:justify-between tw:gap-[14px] tw:text-(--muted) tw:text-[0.94rem]"
            aria-label="Пагинация AI-моделей"
          >
            <span>
              Страница {page} из {totalPages}
            </span>
            <div className="courses-pagination-actions tw:flex tw:items-center tw:flex-wrap tw:gap-[8px]">
              <button
                type="button"
                className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage(Math.max(1, page - 1))}
              >
                Назад
              </button>
              {pages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`courses-pagination-page tw:min-w-[38px] tw:h-[38px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[999px] tw:text-(--text) tw:cursor-pointer tw:leading-[inherit] tw:font-[800] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.82)] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.82)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:hover:text-(--heading) tw:[&.is-active]:text-(--heading) tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:text-[length:inherit] tw:[font-family:inherit] tw:hover:[background:rgba(var(--accent-rgb),_0.18)] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.18)] ${pageNumber === page ? "is-active" : ""}`}
                  disabled={isLoading}
                  onClick={() => setPage(pageNumber)}
                  aria-current={pageNumber === page ? "page" : undefined}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage(Math.min(totalPages, page + 1))}
              >
                Вперёд
              </button>
            </div>
          </nav>
        )}
      </article>
    </section>
  );
}
