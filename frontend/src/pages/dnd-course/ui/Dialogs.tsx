import { useId, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  countLabel,
  getLessonBlocks,
  MAX_CONTENT_BLOCKS,
  WORDS,
} from "../lib/helpers";
import { Icon, Spinner } from "./icons";
import { canFinish, getProblems, getStats } from "../model/selectors";
import { useDndCourseStore } from "../model/store";
import { Modal } from "./common";

export function ModuleDialog() {
  const dialog = useDndCourseStore((state) => state.moduleDialog);
  const allLessons = useDndCourseStore((state) => state.lessons);
  const allModules = useDndCourseStore((state) => state.modules);
  const lessons = useMemo(
    () =>
      allLessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        moduleTitle:
          allModules.find((module) => module.lessonIds.includes(lesson.id))
            ?.title || null,
      })),
    [allLessons, allModules],
  );
  const busy = useDndCourseStore((state) =>
    Boolean(state.pending["create-module"]),
  );
  const update = useDndCourseStore((state) => state.updateModuleDialog);
  const close = useDndCourseStore((state) => state.closeModuleDialog);
  const submit = useDndCourseStore((state) => state.submitModuleDialog);
  const id = useId();
  if (!dialog) return null;

  const selected = dialog.lessonIds;
  const visibleLessons = dialog.pick
    ? lessons
    : lessons.filter((lesson) => selected.includes(lesson.id));
  const toggle = (lessonId: string) =>
    update({
      lessonIds: selected.includes(lessonId)
        ? selected.filter((item) => item !== lessonId)
        : [...selected, lessonId],
    });
  const titleMissing = Boolean(dialog.error) && !dialog.title.trim();
  const descriptionMissing =
    Boolean(dialog.error) && !dialog.description.trim();

  return (
    <Modal
      title="Новый модуль"
      description="Модуль объединяет уроки. После создания выбранные уроки будут перенесены в него."
      onClose={close}
      closeDisabled={busy}
      footer={
        <>
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost tw:text-[0.875rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[38px] tw:p-[0_16px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.875rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.875rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.875rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
            onClick={close}
            disabled={busy}
          >
            Отмена
          </button>
          <button
            type="submit"
            form={`${id}-form`}
            className="dnd-btn dnd-btn--solid tw:text-[0.875rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[38px] tw:p-[0_16px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-text) tw:text-(--dnd-panel) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:var(--dnd-text)] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.875rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.875rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.875rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-text) tw:[&:hover:not(:disabled)]:[&&]:border-(--dnd-text) tw:[&:hover:not(:disabled)]:[&&&]:border-(--dnd-text) tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-text) tw:[&:active:not(:disabled)]:[transform:translateY(1px)] tw:[&:hover:not(:disabled)]:[box-shadow:0_4px_12px_rgba(0,_0,_0,_0.16)]"
            disabled={busy || !selected.length}
            aria-busy={busy}
          >
            {busy ? <Spinner size={14} /> : <Icon name="check" size={16} />}
            {busy ? "Создаём модуль…" : "Создать модуль"}
          </button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          className={`dnd-field tw:grid tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.has-error_input]:border-(--dnd-error) tw:[.page_.dnd-builder_&.has-error_textarea]:border-(--dnd-error) ${titleMissing ? "has-error" : ""}`}
        >
          <label
            className="tw:text-[0.8rem] tw:font-[700] tw:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            htmlFor={`${id}-title`}
          >
            Название
            <span
              className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
              aria-hidden="true"
            >
              {" "}
              *
            </span>
          </label>
          <input
            className="tw:text-[0.88rem] tw:leading-[1.45] tw:w-[100%] tw:min-h-[40px] tw:p-[9px_12px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:[font-family:inherit] tw:[border-width:1px] tw:focus:border-(--dnd-focus) tw:[background:var(--dnd-node)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:focus:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.88rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.45] tw:focus:focus-visible:[&&&]:[outline:none]"
            id={`${id}-title`}
            value={dialog.title}
            onChange={(event) => update({ title: event.target.value })}
            aria-required="true"
            aria-invalid={titleMissing || undefined}
            aria-describedby={dialog.error ? `${id}-error` : undefined}
            disabled={busy}
            maxLength={200}
          />
        </div>
        <div
          className={`dnd-field tw:grid tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.has-error_input]:border-(--dnd-error) tw:[.page_.dnd-builder_&.has-error_textarea]:border-(--dnd-error) ${descriptionMissing ? "has-error" : ""}`}
        >
          <label
            className="tw:text-[0.8rem] tw:font-[700] tw:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            htmlFor={`${id}-description`}
          >
            Описание
            <span
              className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
              aria-hidden="true"
            >
              {" "}
              *
            </span>
          </label>
          <textarea
            className="tw:text-[0.88rem] tw:leading-[1.45] tw:w-[100%] tw:min-h-[40px] tw:p-[9px_12px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:resize-y tw:[font-family:inherit] tw:[border-width:1px] tw:focus:border-(--dnd-focus) tw:[background:var(--dnd-node)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:focus:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.88rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.45] tw:focus:focus-visible:[&&&]:[outline:none]"
            id={`${id}-description`}
            rows={3}
            value={dialog.description}
            onChange={(event) => update({ description: event.target.value })}
            aria-required="true"
            aria-invalid={descriptionMissing || undefined}
            aria-describedby={dialog.error ? `${id}-error` : undefined}
            disabled={busy}
          />
        </div>
        <div className="dnd-field tw:grid tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.has-error_input]:border-(--dnd-error) tw:[.page_.dnd-builder_&.has-error_textarea]:border-(--dnd-error)">
          <label
            className="tw:text-[0.8rem] tw:font-[700] tw:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            htmlFor={`${id}-goals`}
          >
            Цели обучения
          </label>
          <textarea
            className="tw:text-[0.88rem] tw:leading-[1.45] tw:w-[100%] tw:min-h-[40px] tw:p-[9px_12px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:resize-y tw:[font-family:inherit] tw:[border-width:1px] tw:focus:border-(--dnd-focus) tw:[background:var(--dnd-node)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:focus:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.88rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.45] tw:focus:focus-visible:[&&&]:[outline:none]"
            id={`${id}-goals`}
            rows={3}
            value={dialog.learningObjectives}
            onChange={(event) =>
              update({ learningObjectives: event.target.value })
            }
            placeholder="Каждая цель с новой строки"
            disabled={busy}
          />
        </div>
        <fieldset className="dnd-fieldset tw:m-[0] tw:p-[0] tw:grid tw:gap-[8px] tw:min-w-[0] tw:[border:0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <legend className="tw:text-[0.8rem] tw:font-[700] tw:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            Уроки модуля ({selected.length})
          </legend>
          {visibleLessons.length ? (
            <ul className="dnd-check-list nowheel tw:m-[0] tw:p-[0] tw:grid tw:gap-[4px] tw:max-h-[260px] tw:overflow-y-auto tw:[list-style:none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
              {visibleLessons.map((lesson) => (
                <li
                  className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
                  key={lesson.id}
                >
                  <label className="tw:text-[0.86rem] tw:flex tw:items-center tw:gap-[10px] tw:min-h-[40px] tw:p-[6px_10px] tw:rounded-[10px] tw:cursor-pointer tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.86rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
                    <input
                      className="tw:text-[0.96rem] tw:leading-[1.45] tw:w-[18px] tw:h-[18px] tw:flex-[none] tw:accent-(--dnd-accent-ink) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
                      type="checkbox"
                      checked={selected.includes(lesson.id)}
                      onChange={() => toggle(lesson.id)}
                      disabled={busy}
                    />
                    <span
                      className="tw:flex-[1] tw:min-w-[0] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
                      title={lesson.title}
                    >
                      {lesson.title}
                    </span>
                    {lesson.moduleTitle ? (
                      <small>сейчас в «{lesson.moduleTitle}»</small>
                    ) : (
                      <small className="tw:text-[0.74rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.74rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
                        без модуля
                      </small>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dnd-muted">
              Сначала создайте хотя бы один урок из материалов.
            </p>
          )}
        </fieldset>
        {dialog.error ? (
          <p
            id={`${id}-error`}
            className="dnd-inline-error tw:[.page_.dnd-builder_&_>_span]:flex-[1_1_180px] tw:[.page_.dnd-builder_&_>_span]:min-w-[0] tw:[.page_.dnd-builder_&_>_span]:wrap-anywhere"
            role="alert"
          >
            <Icon name="alert" size={16} />
            <span>{dialog.error}</span>
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

export function MaterialPickerDialog() {
  const picker = useDndCourseStore((state) => state.materialPicker);
  const materials = useDndCourseStore(
    useShallow((state) =>
      state.materials.filter(
        (item) => item.status === "ready" && !item.lessonId,
      ),
    ),
  );
  const busy = useDndCourseStore((state) =>
    Boolean(state.pending["create-lesson"]),
  );
  const toggle = useDndCourseStore((state) => state.toggleMaterialPick);
  const close = useDndCourseStore((state) => state.closeMaterialPicker);
  const createLesson = useDndCourseStore(
    (state) => state.createLessonFromMaterials,
  );
  if (!picker) return null;
  const selected = picker.selected;
  const overLimit = selected.length > MAX_CONTENT_BLOCKS;

  return (
    <Modal
      title="Новый урок"
      description="Отметьте материалы в том порядке, в котором они должны идти в уроке."
      onClose={close}
      closeDisabled={busy}
      footer={
        <>
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost"
            onClick={close}
            disabled={busy}
          >
            Отмена
          </button>
          <button
            type="button"
            className="dnd-btn dnd-btn--solid tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&&]:border-(--dnd-text)"
            disabled={busy || !selected.length || overLimit}
            onClick={async () => {
              const created = await createLesson(selected);
              if (created) close();
            }}
          >
            {busy ? <Spinner size={14} /> : <Icon name="check" size={16} />}
            {busy ? "Создаём урок…" : "Объединить в урок"}
          </button>
        </>
      }
    >
      {materials.length ? (
        <ul className="dnd-check-list nowheel tw:[.page_.dnd-builder_&]:m-[0] tw:[.page_.dnd-builder_&]:p-[0] tw:[.page_.dnd-builder_&]:grid tw:[.page_.dnd-builder_&]:gap-[4px] tw:[.page_.dnd-builder_&]:max-h-[260px] tw:[.page_.dnd-builder_&]:overflow-y-auto tw:[.page_.dnd-builder_&]:[list-style:none]">
          {materials.map((item) => {
            const order = selected.indexOf(item.id);
            return (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={order >= 0}
                    onChange={() => toggle(item.id)}
                    disabled={busy}
                  />
                  <span title={item.fileName}>{item.fileName}</span>
                  {order >= 0 ? (
                    <small className="dnd-order-num">{order + 1}</small>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dnd-muted">
          Нет свободных готовых материалов. Загрузите документы или дождитесь
          окончания обработки.
        </p>
      )}
      {overLimit ? (
        <p
          className="dnd-inline-error tw:[.page_.dnd-builder_&_>_span]:flex-[1_1_180px] tw:[.page_.dnd-builder_&_>_span]:min-w-[0] tw:[.page_.dnd-builder_&_>_span]:wrap-anywhere"
          role="alert"
        >
          <Icon name="alert" size={16} />В одном уроке может быть не больше{" "}
          {MAX_CONTENT_BLOCKS} блоков.
        </p>
      ) : null}
    </Modal>
  );
}

export function FinishDialog({
  onCreateCourse,
}: {
  onCreateCourse: (params: { courseId: string }) => unknown;
}) {
  const open = useDndCourseStore((state) => state.finishOpen);
  const snapshot = useDndCourseStore(
    useShallow((state) => ({
      course: state.course,
      materials: state.materials,
      lessons: state.lessons,
      modules: state.modules,
      forms: state.forms,
      pending: state.pending,
      saveStatus: state.saveStatus,
    })),
  );
  const stats = useMemo(() => getStats(snapshot), [snapshot]);
  const problems = useMemo(() => getProblems(snapshot), [snapshot]);
  const finishable = useMemo(() => canFinish(snapshot), [snapshot]);
  const busy = useDndCourseStore((state) => Boolean(state.pending.finish));
  const error = useDndCourseStore((state) => state.finishError);
  const close = useDndCourseStore((state) => state.closeFinish);
  const finish = useDndCourseStore((state) => state.finish);
  const openInspector = useDndCourseStore((state) => state.openInspector);
  const requestFocus = useDndCourseStore((state) => state.requestFocus);
  const lessonsWithoutContent = useDndCourseStore(
    (state) =>
      state.lessons.filter((lesson) => getLessonBlocks(lesson).length === 0)
        .length,
  );
  if (!open) return null;

  const attention = problems.filter((item) => item.severity !== "info").length;
  const blocking = !finishable;

  return (
    <Modal
      title={blocking ? "Структура ещё не готова" : "Курс готов"}
      onClose={close}
      closeDisabled={busy}
      size="md"
      footer={
        <>
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost"
            onClick={close}
            disabled={busy}
          >
            Вернуться к редактированию
          </button>
          <button
            type="button"
            className="dnd-btn dnd-btn--accent tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&]:border-(--dnd-accent-ink) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&]:border-(--dnd-accent-ink) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&&]:border-(--dnd-accent-ink)"
            onClick={() => finish(onCreateCourse)}
            disabled={busy || blocking}
            aria-busy={busy}
          >
            {busy ? <Spinner size={14} /> : <Icon name="flag" size={16} />}
            {busy
              ? "Открываем курс…"
              : error
                ? "Повторить"
                : "Завершить и посмотреть курс"}
          </button>
        </>
      }
    >
      <dl className="dnd-stats dnd-stats--summary tw:[.page_.dnd-builder_&]:grid-cols-[repeat(4,_minmax(0,_1fr))] tw:[.page_.dnd-builder_&]:mb-[14px] tw:max-767:[.page_.dnd-builder_&]:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:[.page_.dnd-builder_&_div]:p-[10px_12px] tw:[.page_.dnd-builder_&_div]:rounded-[12px] tw:[.page_.dnd-builder_&_div]:[border:1px_solid_var(--dnd-border)] tw:[.page_.dnd-builder_&_div]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_&_dt]:text-(--dnd-muted) tw:[.page_.dnd-builder_&_dt]:text-[0.74rem] tw:[.page_.dnd-builder_&_dd]:m-[2px_0_0] tw:[.page_.dnd-builder_&_dd]:font-[800] tw:[.page_.dnd-builder_&_dd]:[font-variant-numeric:tabular-nums] tw:[.page_.dnd-builder_&_.is-warn]:border-(--dnd-warn) tw:[.page_.dnd-builder_&_.is-warn]:[background:var(--dnd-warn-bg)] tw:[.page_.dnd-builder_&_.is-ok]:border-(--dnd-ok) tw:[.page_.dnd-builder_&_.is-ok]:[background:var(--dnd-ok-bg)] tw:[.page_.dnd-builder_&_dd]:text-[0.95rem]">
        <div>
          <dt>Модули</dt>
          <dd>{countLabel(stats.modules, WORDS.module)}</dd>
        </div>
        <div>
          <dt>Уроки</dt>
          <dd>{countLabel(stats.lessons, WORDS.lesson)}</dd>
        </div>
        <div>
          <dt>Материалы</dt>
          <dd>{countLabel(stats.materials, WORDS.material)}</dd>
        </div>
        <div className={attention ? "is-warn" : "is-ok"}>
          <dt>Требуют внимания</dt>
          <dd>{attention ? countLabel(attention, WORDS.item) : "нет"}</dd>
        </div>
      </dl>
      {blocking ? (
        <p
          className="dnd-inline-error tw:[.page_.dnd-builder_&_>_span]:flex-[1_1_180px] tw:[.page_.dnd-builder_&_>_span]:min-w-[0] tw:[.page_.dnd-builder_&_>_span]:wrap-anywhere"
          role="alert"
        >
          <Icon name="alert" size={16} />
          <span>
            {stats.nonEmptyModules === 0
              ? "Чтобы завершить, нужен хотя бы один модуль с уроком."
              : "Дождитесь окончания сохранения и обработки документов."}
          </span>
        </p>
      ) : null}
      {problems.length || lessonsWithoutContent ? (
        <ul className="dnd-problems nowheel tw:[.page_.dnd-builder_&]:m-[0_0_12px] tw:[.page_.dnd-builder_&]:p-[0] tw:[.page_.dnd-builder_&]:grid tw:[.page_.dnd-builder_&]:gap-[6px] tw:[.page_.dnd-builder_&]:max-h-[260px] tw:[.page_.dnd-builder_&]:overflow-y-auto tw:[.page_.dnd-builder_&]:[list-style:none] tw:[.page_.dnd-builder_&_li]:flex tw:[.page_.dnd-builder_&_li]:items-center tw:[.page_.dnd-builder_&_li]:gap-[8px] tw:[.page_.dnd-builder_&_li]:p-[8px_10px] tw:[.page_.dnd-builder_&_li]:rounded-[10px] tw:[.page_.dnd-builder_&_li]:[background:var(--dnd-warn-bg)] tw:[.page_.dnd-builder_&_li]:text-(--dnd-text) tw:[.page_.dnd-builder_&_li]:text-[0.84rem] tw:[.page_.dnd-builder_&_li.is-info]:[background:var(--dnd-info-bg)] tw:[.page_.dnd-builder_&_li.is-blocking]:[background:var(--dnd-error-bg)] tw:[.page_.dnd-builder_&_li.is-blocking]:text-(--dnd-error) tw:[.page_.dnd-builder_&_li_span]:flex-[1] tw:[.page_.dnd-builder_&_li_span]:min-w-[0]">
          {problems.map((problem) => (
            <li key={problem.id} className={`is-${problem.severity}`}>
              <Icon
                name={problem.severity === "info" ? "info" : "alert"}
                size={15}
              />
              <span>{problem.text}</span>
              {problem.nodeId ? (
                <button
                  type="button"
                  className="dnd-link dnd-link--sm tw:[.page_.dnd-builder_&]:text-[0.8rem]"
                  onClick={() => {
                    close();
                    openInspector(problem.nodeId ?? "");
                    requestFocus([problem.nodeId ?? ""]);
                  }}
                >
                  Показать
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dnd-muted">
          <Icon name="check" size={15} /> Проблем не найдено.
        </p>
      )}
      <p className="dnd-muted dnd-finish-note tw:[.page_.dnd-builder_&]:text-[0.78rem]">
        Некритичные замечания не мешают завершению. Уроки без модуля не попадут
        в курс. Из просмотра курса можно в любой момент вернуться на холст и
        доделать.
      </p>
      {error ? (
        <p
          className="dnd-inline-error tw:[.page_.dnd-builder_&_>_span]:flex-[1_1_180px] tw:[.page_.dnd-builder_&_>_span]:min-w-[0] tw:[.page_.dnd-builder_&_>_span]:wrap-anywhere"
          role="alert"
        >
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </p>
      ) : null}
    </Modal>
  );
}
