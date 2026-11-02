import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { MATERIAL_STATUS } from "../config/constants";
import {
  countLabel,
  getLessonBlocks,
  MAX_CONTENT_BLOCKS,
  nodeId,
  WORDS,
} from "../lib/helpers";
import { Icon } from "./icons";
import { useDndCourseStore } from "../model/store";
import { ActionMenu, StatusPill, useDndActions, type MenuItem } from "./common";
import type { DndLesson } from "../model/types";

function moduleMenu(
  lessonIds: string[],
  currentModuleId: string | null,
): MenuItem[] {
  const state = useDndCourseStore.getState();
  return [
    {
      key: "new",
      icon: "plus",
      label:
        lessonIds.length > 1
          ? `Новый модуль из ${lessonIds.length} уроков`
          : "Новый модуль…",
      onSelect: () => state.openModuleDialog(lessonIds),
    },
    ...[...state.modules]
      .sort((a, b) => a.order - b.order)
      .map((module) => ({
        key: module.id,
        icon: "module",
        label: module.title,
        disabled: module.id === currentModuleId,
        onSelect: async () => {
          for (const id of lessonIds) {
            // eslint-disable-next-line no-await-in-loop
            await useDndCourseStore
              .getState()
              .moveLessonToModule(id, module.id);
          }
        },
      })),
  ];
}

function LessonRow({
  lesson,
  index,
  total,
  moduleId,
}: {
  lesson: DndLesson;
  index: number;
  total: number;
  moduleId: string | null;
}) {
  const openInspector = useDndCourseStore((state) => state.openInspector);
  const moveLessonBy = useDndCourseStore((state) => state.moveLessonBy);
  const toggleSelected = useDndCourseStore((state) => state.toggleSelected);
  const selected = useDndCourseStore((state) =>
    state.selectedIds.includes(nodeId.lesson(lesson.id)),
  );
  const pending = useDndCourseStore((state) =>
    Boolean(
      state.pending[nodeId.lesson(lesson.id)] ||
      (moduleId && state.pending[`order:${moduleId}`]),
    ),
  );
  const { requestDelete } = useDndActions();
  return (
    <li
      className={`dnd-list-row tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:flex tw:items-center tw:gap-[10px] tw:min-h-[52px] tw:p-[6px_8px_6px_10px] tw:rounded-[12px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:max-767:flex-wrap tw:[&.is-pending]:opacity-[0.7] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] ${pending ? "is-pending" : ""}`}
    >
      {!moduleId ? (
        <input
          className="tw:text-[0.96rem] tw:leading-[1.45] tw:w-[18px] tw:h-[18px] tw:flex-[none] tw:accent-(--dnd-accent-ink) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
          type="checkbox"
          checked={selected}
          onChange={() => toggleSelected(nodeId.lesson(lesson.id))}
          aria-label={`Выбрать урок «${lesson.title}»`}
        />
      ) : (
        <span className="dnd-order-num tw:inline-grid tw:min-w-[24px] tw:h-[24px] tw:p-[0_4px] tw:rounded-[7px] tw:text-(--dnd-muted) tw:text-[0.74rem] tw:font-[800] tw:[place-items:center] tw:[background:var(--dnd-panel-2)] tw:[font-variant-numeric:tabular-nums] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          {index + 1}
        </span>
      )}
      <button
        type="button"
        className="dnd-list-main tw:text-[0.96rem] tw:leading-[1.45] tw:flex-[1] tw:min-w-[0] tw:grid tw:gap-[3px] tw:p-[4px_0] tw:text-[inherit] tw:text-left tw:cursor-pointer tw:[justify-items:start] tw:[border:0] tw:[background:none] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
        onClick={() => openInspector(nodeId.lesson(lesson.id), "main")}
      >
        <strong
          className="tw:max-w-[100%] tw:text-[0.88rem] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
          title={lesson.title}
        >
          {lesson.title}
        </strong>
        <small className="tw:text-[0.76rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.76rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
          {getLessonBlocks(lesson).length}/{MAX_CONTENT_BLOCKS} {WORDS.block[2]}
          {lesson.estimatedTimeMinutes
            ? ` · ${lesson.estimatedTimeMinutes} мин`
            : ""}
        </small>
      </button>
      <div className="dnd-list-actions tw:flex tw:items-center tw:gap-[2px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        {moduleId ? (
          <>
            <button
              type="button"
              className="dnd-icon-btn dnd-icon-btn--sm tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
              onClick={() => moveLessonBy(lesson.id, -1)}
              disabled={index === 0 || pending}
              aria-label={`Урок «${lesson.title}» выше`}
              title="Выше"
            >
              <Icon name="arrowUp" size={15} />
            </button>
            <button
              type="button"
              className="dnd-icon-btn dnd-icon-btn--sm tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
              onClick={() => moveLessonBy(lesson.id, 1)}
              disabled={index === total - 1 || pending}
              aria-label={`Урок «${lesson.title}» ниже`}
              title="Ниже"
            >
              <Icon name="arrowDown" size={15} />
            </button>
          </>
        ) : null}
        <ActionMenu
          label="Переместить в модуль"
          icon="module"
          items={() => moduleMenu([lesson.id], moduleId)}
          buttonClassName="dnd-icon-btn dnd-icon-btn--sm"
          align="end"
        />
        <button
          type="button"
          className="dnd-icon-btn dnd-icon-btn--sm is-danger tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[&&]:text-(--dnd-error) tw:[&:hover:not(:disabled)]:[&&&&]:[background:var(--dnd-error-bg)]"
          onClick={() => requestDelete(nodeId.lesson(lesson.id))}
          aria-label={`Удалить урок «${lesson.title}»`}
          title="Удалить"
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
    </li>
  );
}

export function ListView() {
  const materials = useDndCourseStore((state) => state.materials);
  const lessons = useDndCourseStore((state) => state.lessons);
  const modules = useDndCourseStore((state) => state.modules);
  const selectedIds = useDndCourseStore(
    useShallow((state) => state.selectedIds),
  );
  const toggleSelected = useDndCourseStore((state) => state.toggleSelected);
  const setSelection = useDndCourseStore((state) => state.setSelection);
  const openInspector = useDndCourseStore((state) => state.openInspector);
  const createLesson = useDndCourseStore(
    (state) => state.createLessonFromMaterials,
  );
  const openModuleDialog = useDndCourseStore((state) => state.openModuleDialog);
  const moveModuleBy = useDndCourseStore((state) => state.moveModuleBy);
  const retry = useDndCourseStore((state) => state.retryMaterial);
  const creatingLesson = useDndCourseStore((state) =>
    Boolean(state.pending["create-lesson"]),
  );
  const orderPending = useDndCourseStore((state) =>
    Boolean(state.pending["order:modules"]),
  );
  const { pickFiles, requestDelete } = useDndActions();

  const assigned = useMemo(
    () => new Set(modules.flatMap((module) => module.lessonIds)),
    [modules],
  );
  const freeLessons = lessons.filter((lesson) => !assigned.has(lesson.id));
  const orderedModules = [...modules].sort((a, b) => a.order - b.order);
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const selectedMaterials = selectedIds
    .filter((id) => id.startsWith("material:"))
    .map((id) => id.slice(9));
  const selectedLessons = selectedIds
    .filter((id) => id.startsWith("lesson:"))
    .map((id) => id.slice(7))
    .filter((id) => !assigned.has(id));

  return (
    <div className="dnd-list nowheel tw:absolute tw:inset-[0] tw:overflow-y-auto tw:p-[14px] tw:grid tw:gap-[14px] tw:[align-content:start] tw:[background:var(--dnd-canvas)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
      <section
        className="dnd-list-section tw:grid tw:gap-[10px] tw:p-[14px] tw:rounded-[16px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-panel)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
        aria-labelledby="dnd-list-materials"
      >
        <header className="tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <h2
            className="tw:leading-[1.28] tw:tracking-[-0.016em] tw:flex tw:items-center tw:gap-[8px] tw:font-[800] tw:[&&&]:text-[0.98rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.98rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            id="dnd-list-materials"
          >
            <Icon name="file" size={17} /> Материалы{" "}
            <small className="tw:text-(--dnd-muted) tw:font-[700] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              {materials.length}
            </small>
          </h2>
          <button
            type="button"
            className="dnd-btn dnd-btn--solid dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-text) tw:text-(--dnd-panel) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:var(--dnd-text)] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-text) tw:[&:hover:not(:disabled)]:[&&]:border-(--dnd-text) tw:[&:hover:not(:disabled)]:[&&&]:border-(--dnd-text) tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-text) tw:[&:active:not(:disabled)]:[transform:translateY(1px)] tw:[&:hover:not(:disabled)]:[box-shadow:0_4px_12px_rgba(0,_0,_0,_0.16)]"
            onClick={() => pickFiles()}
          >
            <Icon name="upload" size={15} /> Загрузить
          </button>
        </header>
        {materials.length ? (
          <ul className="dnd-list-rows tw:m-[0] tw:p-[0] tw:grid tw:gap-[6px] tw:[list-style:none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {materials.map((material) => {
              const key = nodeId.material(material.id);
              const status = material.lessonId ? "used" : material.status;
              const selectable =
                material.status === "ready" && !material.lessonId;
              return (
                <li
                  key={material.id}
                  className={`dnd-list-row tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:flex tw:items-center tw:gap-[10px] tw:min-h-[52px] tw:p-[6px_8px_6px_10px] tw:rounded-[12px] tw:border-solid tw:border-(--dnd-border) tw:[border-width:1px] tw:[&.is-error]:border-(--dnd-error) tw:[background:var(--dnd-node)] tw:max-767:flex-wrap tw:[&.is-pending]:opacity-[0.7] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] is-${status}`}
                >
                  <input
                    className="tw:text-[0.96rem] tw:leading-[1.45] tw:w-[18px] tw:h-[18px] tw:flex-[none] tw:accent-(--dnd-accent-ink) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
                    type="checkbox"
                    checked={selectedIds.includes(key)}
                    onChange={() => toggleSelected(key)}
                    disabled={!selectable}
                    aria-label={`Выбрать материал «${material.fileName}»`}
                  />
                  <button
                    type="button"
                    className="dnd-list-main tw:text-[0.96rem] tw:leading-[1.45] tw:flex-[1] tw:min-w-[0] tw:grid tw:gap-[3px] tw:p-[4px_0] tw:text-[inherit] tw:text-left tw:cursor-pointer tw:[justify-items:start] tw:[border:0] tw:[background:none] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
                    onClick={() => openInspector(key, "content")}
                    disabled={material.status === "uploading"}
                  >
                    <strong
                      className="tw:max-w-[100%] tw:text-[0.88rem] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
                      title={material.fileName}
                    >
                      #{material.number} {material.fileName}
                    </strong>
                    <StatusPill
                      tone={MATERIAL_STATUS[status]?.tone}
                      busy={material.status === "uploading"}
                      icon={status === "error" ? "alert" : null}
                    >
                      {MATERIAL_STATUS[status]?.label}
                    </StatusPill>
                    {material.status === "error" ? (
                      <small className="dnd-node-error">{material.error}</small>
                    ) : null}
                  </button>
                  <div className="dnd-list-actions tw:flex tw:items-center tw:gap-[2px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                    {material.status === "error" ? (
                      <button
                        type="button"
                        className="dnd-icon-btn dnd-icon-btn--sm"
                        onClick={() => {
                          if (material.tooBig || !retry(material.id))
                            pickFiles({ replaceMaterialId: material.id });
                        }}
                        aria-label={`Повторить загрузку «${material.fileName}»`}
                        title="Повторить"
                      >
                        <Icon name="retry" size={15} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="dnd-icon-btn dnd-icon-btn--sm is-danger tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border)"
                      onClick={() => requestDelete(key)}
                      disabled={
                        Boolean(material.lessonId) ||
                        material.status === "uploading"
                      }
                      aria-label={`Удалить материал «${material.fileName}»`}
                      title="Удалить"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="dnd-muted">
            Загрузите документы — каждый станет материалом для урока.
          </p>
        )}
        {selectedMaterials.length ? (
          <div className="dnd-list-toolbar tw:[.page_.dnd-builder_&]:sticky tw:[.page_.dnd-builder_&]:bottom-[0] tw:[.page_.dnd-builder_&]:flex tw:[.page_.dnd-builder_&]:items-center tw:[.page_.dnd-builder_&]:flex-wrap tw:[.page_.dnd-builder_&]:gap-[8px] tw:[.page_.dnd-builder_&]:p-[10px] tw:[.page_.dnd-builder_&]:rounded-[12px] tw:[.page_.dnd-builder_&]:text-[0.84rem] tw:[.page_.dnd-builder_&]:font-[650] tw:[.page_.dnd-builder_&]:[background:var(--dnd-info-bg)] tw:[.page_.dnd-builder_&_span]:flex-[1]">
            <span>
              Выбрано: {countLabel(selectedMaterials.length, WORDS.material)}
            </span>
            <button
              type="button"
              className="dnd-btn dnd-btn--ghost dnd-btn--sm"
              onClick={() => setSelection([])}
            >
              Снять выбор
            </button>
            <button
              type="button"
              className="dnd-btn dnd-btn--solid dnd-btn--sm tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&&]:border-(--dnd-text)"
              onClick={() => createLesson(selectedMaterials)}
              disabled={
                creatingLesson || selectedMaterials.length > MAX_CONTENT_BLOCKS
              }
            >
              <Icon name="lesson" size={15} /> Объединить в урок
            </button>
          </div>
        ) : null}
      </section>

      <section
        className="dnd-list-section tw:grid tw:gap-[10px] tw:p-[14px] tw:rounded-[16px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-panel)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
        aria-labelledby="dnd-list-free"
      >
        <header className="tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <h2
            className="tw:leading-[1.28] tw:tracking-[-0.016em] tw:flex tw:items-center tw:gap-[8px] tw:font-[800] tw:[&&&]:text-[0.98rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.98rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            id="dnd-list-free"
          >
            <Icon name="lesson" size={17} /> Уроки без модуля{" "}
            <small className="tw:text-(--dnd-muted) tw:font-[700] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              {freeLessons.length}
            </small>
          </h2>
        </header>
        {freeLessons.length ? (
          <ul className="dnd-list-rows tw:m-[0] tw:p-[0] tw:grid tw:gap-[6px] tw:[list-style:none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {freeLessons.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                index={0}
                total={1}
                moduleId={null}
              />
            ))}
          </ul>
        ) : (
          <p className="dnd-muted">
            Отметьте материалы и нажмите «Объединить в урок».
          </p>
        )}
        {selectedLessons.length ? (
          <div className="dnd-list-toolbar tw:[.page_.dnd-builder_&]:sticky tw:[.page_.dnd-builder_&]:bottom-[0] tw:[.page_.dnd-builder_&]:flex tw:[.page_.dnd-builder_&]:items-center tw:[.page_.dnd-builder_&]:flex-wrap tw:[.page_.dnd-builder_&]:gap-[8px] tw:[.page_.dnd-builder_&]:p-[10px] tw:[.page_.dnd-builder_&]:rounded-[12px] tw:[.page_.dnd-builder_&]:text-[0.84rem] tw:[.page_.dnd-builder_&]:font-[650] tw:[.page_.dnd-builder_&]:[background:var(--dnd-info-bg)] tw:[.page_.dnd-builder_&_span]:flex-[1]">
            <span>
              Выбрано: {countLabel(selectedLessons.length, WORDS.lesson)}
            </span>
            <button
              type="button"
              className="dnd-btn dnd-btn--solid dnd-btn--sm tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&&]:border-(--dnd-text)"
              onClick={() => openModuleDialog(selectedLessons)}
            >
              <Icon name="module" size={15} /> Объединить в модуль
            </button>
          </div>
        ) : null}
      </section>

      <section
        className="dnd-list-section tw:grid tw:gap-[10px] tw:p-[14px] tw:rounded-[16px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-panel)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
        aria-labelledby="dnd-list-modules"
      >
        <header className="tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <h2
            className="tw:leading-[1.28] tw:tracking-[-0.016em] tw:flex tw:items-center tw:gap-[8px] tw:font-[800] tw:[&&&]:text-[0.98rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.98rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            id="dnd-list-modules"
          >
            <Icon name="module" size={17} /> Модули{" "}
            <small className="tw:text-(--dnd-muted) tw:font-[700] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              {modules.length}
            </small>
          </h2>
        </header>
        {orderedModules.length ? (
          <ol className="dnd-list-modules tw:m-[0] tw:p-[0] tw:grid tw:gap-[6px] tw:[list-style:none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {orderedModules.map((module, index) => (
              <li
                key={module.id}
                className="dnd-list-module tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:grid tw:gap-[6px] tw:p-[10px] tw:rounded-[14px] tw:[border:1.5px_dashed_var(--dnd-border-strong)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
              >
                <div className="dnd-list-module-head tw:flex tw:items-center tw:gap-[10px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                  <span className="dnd-order-num tw:inline-grid tw:min-w-[24px] tw:h-[24px] tw:p-[0_4px] tw:rounded-[7px] tw:text-(--dnd-muted) tw:text-[0.74rem] tw:font-[800] tw:[place-items:center] tw:[background:var(--dnd-panel-2)] tw:[font-variant-numeric:tabular-nums] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    className="dnd-list-main tw:text-[0.96rem] tw:leading-[1.45] tw:flex-[1] tw:min-w-[0] tw:grid tw:gap-[3px] tw:p-[4px_0] tw:text-[inherit] tw:text-left tw:cursor-pointer tw:[justify-items:start] tw:[border:0] tw:[background:none] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
                    onClick={() =>
                      openInspector(nodeId.module(module.id), "main")
                    }
                  >
                    <strong
                      className="tw:max-w-[100%] tw:text-[0.88rem] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
                      title={module.title}
                    >
                      {module.title}
                    </strong>
                    <small className="tw:text-[0.76rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.76rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
                      {countLabel(module.lessonIds.length, WORDS.lesson)}
                    </small>
                  </button>
                  <div className="dnd-list-actions tw:flex tw:items-center tw:gap-[2px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                    <button
                      type="button"
                      className="dnd-icon-btn dnd-icon-btn--sm tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)]"
                      onClick={() => moveModuleBy(module.id, -1)}
                      disabled={index === 0 || orderPending}
                      aria-label={`Модуль «${module.title}» выше`}
                      title="Выше"
                    >
                      <Icon name="arrowUp" size={15} />
                    </button>
                    <button
                      type="button"
                      className="dnd-icon-btn dnd-icon-btn--sm tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)]"
                      onClick={() => moveModuleBy(module.id, 1)}
                      disabled={
                        index === orderedModules.length - 1 || orderPending
                      }
                      aria-label={`Модуль «${module.title}» ниже`}
                      title="Ниже"
                    >
                      <Icon name="arrowDown" size={15} />
                    </button>
                    <button
                      type="button"
                      className="dnd-icon-btn dnd-icon-btn--sm is-danger tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[&&]:text-(--dnd-error) tw:[&:hover:not(:disabled)]:[&&&&]:[background:var(--dnd-error-bg)]"
                      onClick={() => requestDelete(nodeId.module(module.id))}
                      aria-label={`Удалить модуль «${module.title}»`}
                      title="Удалить"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
                {module.lessonIds.length ? (
                  <ul className="dnd-list-rows tw:m-[0] tw:p-[0] tw:grid tw:gap-[6px] tw:[list-style:none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                    {module.lessonIds.map((lessonId, lessonIndex) => {
                      const lesson = lessonById.get(lessonId);
                      return lesson ? (
                        <LessonRow
                          key={lessonId}
                          lesson={lesson}
                          index={lessonIndex}
                          total={module.lessonIds.length}
                          moduleId={module.id}
                        />
                      ) : null;
                    })}
                  </ul>
                ) : (
                  <p className="dnd-muted">
                    Пустой модуль — перенесите в него урок.
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="dnd-muted">
            Отметьте уроки без модуля и нажмите «Объединить в модуль».
          </p>
        )}
      </section>
    </div>
  );
}
