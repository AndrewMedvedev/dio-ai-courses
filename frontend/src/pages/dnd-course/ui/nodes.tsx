import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import {
  DIFFICULTY_LABEL,
  MATERIAL_STATUS,
  MODULE_LAYOUT,
} from "../config/constants";
import {
  countLabel,
  formatBytes,
  getLessonBlocks,
  getLessonFill,
  getModuleFill,
  markdownExcerpt,
  MAX_CONTENT_BLOCKS,
  nodeId,
  WORDS,
} from "../lib/helpers";
import { Icon, Spinner } from "./icons";
import { moduleHeight } from "../lib/layout";
import {
  getProgress,
  getStats,
  matchFilter,
  canFinish,
} from "../model/selectors";
import { useDndCourseStore } from "../model/store";
import { ActionMenu, StatusPill, useDndActions, type MenuItem } from "./common";
import type { NodeData } from "../lib/graph";
import type {
  DndCourse,
  DndLesson,
  DndMaterial,
  DndModule,
  NodeType,
} from "../model/types";

type DndNodeProps = NodeProps<Node<NodeData>>;

interface NodeChrome {
  dimmed: boolean;
  highlighted: boolean;
  dropState: "ok" | "bad" | null;
  active: boolean;
  pending: boolean;
}

function useNodeChrome(
  id: string,
  type: NodeType,
  entity: DndCourse | DndMaterial | DndLesson | DndModule | null | undefined,
): NodeChrome {
  return useDndCourseStore(
    useShallow((state) => {
      const hint = state.dropHint;
      return {
        dimmed:
          Boolean(state.filter) &&
          !!entity &&
          !matchFilter(state.filter, type, entity, state),
        highlighted:
          Boolean(state.filter) &&
          !!entity &&
          matchFilter(state.filter, type, entity, state),
        dropState: hint?.targetId === id ? (hint?.valid ? "ok" : "bad") : null,
        active: state.activeNodeId === id && state.inspector.open,
        pending: Boolean(state.pending[id]),
      };
    }),
  );
}

function chromeClass(
  { dimmed, highlighted, dropState, active, pending }: NodeChrome,
  selected: boolean | undefined,
) {
  return [
    selected ? "is-selected" : "",
    active ? "is-active" : "",
    dimmed ? "is-dimmed" : "",
    highlighted ? "is-highlighted" : "",
    dropState ? `is-drop-${dropState}` : "",
    pending ? "is-pending" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function FillBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="dnd-fill tw:relative tw:h-[4px] tw:rounded-[999px] tw:overflow-hidden tw:[.page_.dnd-builder_.dnd-module-toolbar_&]:flex-[1] tw:[.page_.dnd-builder_.dnd-module-toolbar_&]:mr-[6px] tw:[.page_.dnd-builder_.dnd-node_&]:h-[8px] tw:[background:var(--dnd-border)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
      data-tip={`${label}: ${value}%`}
    >
      <span className="dnd-visually-hidden tw:absolute! tw:w-[1px]! tw:h-[1px]! tw:p-[0]! tw:m-[-1px]! tw:overflow-hidden! tw:whitespace-nowrap! tw:[clip:rect(0_0_0_0)]! tw:[border:0]! tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        {label}: {value}%
      </span>
      <i
        className="tw:absolute tw:inset-[0_auto_0_0] tw:rounded-[inherit] tw:[background:var(--dnd-accent)] tw:[transition:width_0.3s_var(--dnd-ease)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
        style={{ width: `${value}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

function NodeButton({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: string;
}) {
  return (
    <button
      type="button"
      className={`dnd-node-btn nodrag nopan tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[46px] tw:h-[46px] tw:rounded-[12px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-muted) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[&[aria-expanded=true]]:border-(--dnd-border) tw:[background:transparent] tw:[&[aria-expanded=true]]:text-(--dnd-text) tw:[transition:background_0.15s,_color_0.15s,_border-color_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&[aria-expanded=true]]:[background:var(--dnd-panel-2)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] ${tone ? `is-${tone}` : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      disabled={disabled}
      aria-label={label}
      data-tip={label}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

// ───────────── Курс ─────────────
export const CourseNode = memo(function CourseNode({
  id,
  selected,
}: DndNodeProps) {
  const course = useDndCourseStore((state) => state.course);
  const stats = useDndCourseStore(useShallow(getStats));
  const percent = useDndCourseStore((state) => getProgress(state).percent);
  const finishable = useDndCourseStore(canFinish);
  const openInspector = useDndCourseStore((state) => state.openInspector);
  const openFinish = useDndCourseStore((state) => state.openFinish);
  const chrome = useNodeChrome(id, "course", course);
  if (!course) return null;

  return (
    <div
      className={String.raw`dnd-node dnd-node--course tw:relative tw:w-[100%] tw:h-[100%] tw:flex tw:flex-col tw:gap-[10px] tw:p-[22px] tw:border-solid tw:border-(--dnd-border-strong) tw:rounded-(--dnd-radius) tw:text-(--dnd-text) tw:text-left tw:overflow-visible tw:[background:radial-gradient(120%_80%_at_100%_0%,_var(--dnd-accent-soft),_transparent_60%),_var(--dnd-node)] tw:[border-width:1.5px] tw:[.page_.dnd-builder_&.is-active]:border-(--dnd-focus) tw:[&.is-selected]:border-(--dnd-focus) tw:[&.is-drop-ok]:border-(--dnd-ok) tw:[&.is-drop-bad]:border-(--dnd-error) tw:[box-shadow:var(--dnd-shadow)] tw:animate-dnd-pop tw:[transition:border-color_0.15s,_box-shadow_0.15s,_opacity_0.2s,_transform_0.15s] tw:[--dnd-node-stripe:linear-gradient(90deg,_var(--dnd-accent),_var(--dnd-blue))] tw:[&.is-dimmed]:opacity-[0.32] tw:[&.is-pending]:opacity-[0.86] tw:[&.is-drop-bad]:cursor-not-allowed tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.is-selected]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring),_var(--dnd-shadow)] tw:[&.is-highlighted]:[box-shadow:0_0_0_3px_var(--dnd-info-bg),_0_0_0_1px_var(--dnd-info),_var(--dnd-shadow)] tw:[&.is-drop-ok]:[box-shadow:0_0_0_4px_var(--dnd-ok-bg),_var(--dnd-shadow)] tw:[&.is-drop-bad]:[box-shadow:0_0_0_4px_var(--dnd-error-bg),_var(--dnd-shadow)] tw:[&::before]:absolute tw:[&::before]:left-[12px] tw:[&::before]:right-[12px] tw:[&::before]:top-[-1px] tw:[&::before]:h-[4px] tw:[&::before]:rounded-[0_0_4px_4px] tw:[.page_.dnd-builder_.dnd-canvas_.react-flow\_\_node:focus-visible_>_&]:focus-visible:[outline-offset:3px] tw:[&::before]:[content:''] tw:[&::before]:[background:var(--dnd-node-stripe,_transparent)] ${chromeClass(chrome, selected)}`}
      aria-label={`Курс «${course.title}». ${countLabel(stats.modules, WORDS.module)}, ${countLabel(stats.lessons, WORDS.lesson)}. Готовность ${percent}%.`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="dnd-handle tw:w-[11px] tw:h-[11px] tw:[background:var(--dnd-node)] tw:[border:2px_solid_var(--dnd-edge)] tw:[transition:transform_0.15s,_border-color_0.15s,_background_0.15s] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.react-flow\_\_handle:not(.connectable)]:opacity-[0.5]"
        isConnectable={false}
      />
      <div className="dnd-node-kicker tw:flex tw:items-center tw:gap-[8px] tw:min-h-[28px] tw:text-(--dnd-muted) tw:text-[1.02rem] tw:font-[700] tw:tracking-[0.02em] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <Icon name="course" size={16} />
        Курс
        <span className="dnd-node-kicker-end tw:ml-[auto] tw:inline-flex tw:items-center tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          {DIFFICULTY_LABEL[course.difficulty] || "—"}
        </span>
      </div>
      <h3
        className="dnd-node-title tw:text-[1.5rem] tw:leading-[1.3] tw:tracking-[-0.008em] tw:font-[700] tw:text-(--dnd-heading) tw:overflow-hidden tw:wrap-anywhere tw:[display:-webkit-box] tw:[-webkit-line-clamp:2] tw:[-webkit-box-orient:vertical] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.5rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.3] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
        data-tip={course.title}
      >
        {course.title}
      </h3>
      <p className="dnd-node-meta tw:leading-[1.72] tw:tracking-[0.012em] tw:m-[0] tw:flex tw:flex-wrap tw:gap-[4px_12px] tw:text-(--dnd-muted) tw:[&&&]:text-[1.1rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.1rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
        {countLabel(stats.modules, WORDS.module)} ·{" "}
        {countLabel(stats.lessons, WORDS.lesson)}
      </p>
      <div
        className="dnd-course-progress tw:flex tw:items-center tw:gap-[10px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
        aria-hidden="true"
      >
        <div className="dnd-course-progress-track tw:flex-[1] tw:h-[12px] tw:rounded-[999px] tw:overflow-hidden tw:[background:var(--dnd-border)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <i
            className="tw:block tw:h-[100%] tw:rounded-[inherit] tw:[background:linear-gradient(90deg,_var(--dnd-accent),_var(--dnd-blue))] tw:[transition:width_0.4s_var(--dnd-ease)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <strong className="tw:text-[1.1rem] tw:min-w-[36px] tw:text-right tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          {percent}%
        </strong>
      </div>
      <p
        className={`dnd-node-status tw:leading-[1.72] tw:tracking-[0.012em] tw:m-[0] tw:flex tw:items-center tw:gap-[6px] tw:text-(--dnd-muted) tw:[&&&]:text-[1.1rem] tw:[&.is-ok]:text-(--dnd-ok) tw:[&.is-ok]:font-[650] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.1rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] ${finishable ? "is-ok" : ""}`}
      >
        <Icon name={finishable ? "check" : "info"} size={14} />
        {finishable
          ? "Структура готова к проверке"
          : "Структура ещё собирается"}
      </p>
      <div className="dnd-node-actions tw:mt-[auto] tw:flex tw:items-center tw:gap-[8px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <button
          type="button"
          className="dnd-btn dnd-btn--ghost dnd-btn--sm nodrag nopan tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:p-[0_16px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[&&&&]:text-[1.05rem] tw:[&&&&]:min-h-[46px] tw:[&&]:p-[0_16px] tw:[&&&]:p-[0_16px] tw:[&&&&]:p-[0_16px] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
          onClick={(event) => {
            event.stopPropagation();
            openInspector("course", "main");
          }}
        >
          <Icon name="settings" size={15} />
          Настройки
        </button>
        <button
          type="button"
          className="dnd-btn dnd-btn--accent dnd-btn--sm nodrag nopan tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:p-[0_16px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-accent) tw:text-[#241c24] tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[&&&&]:text-[1.05rem] tw:[&&&&]:min-h-[46px] tw:[&&]:p-[0_16px] tw:[&&&]:p-[0_16px] tw:[&&&&]:p-[0_16px] tw:[border-width:1px] tw:[background:var(--dnd-accent)] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&&]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-accent-ink) tw:[&:active:not(:disabled)]:[transform:translateY(1px)] tw:[&:hover:not(:disabled)]:[box-shadow:0_6px_18px_rgba(203,_170,_203,_0.45)]"
          onClick={(event) => {
            event.stopPropagation();
            openFinish();
          }}
        >
          <Icon name="flag" size={15} />
          Проверить
        </button>
      </div>
    </div>
  );
});

// ───────────── Загрузка ─────────────
export const UploadNode = memo(function UploadNode(_props: DndNodeProps) {
  const { pickFiles } = useDndActions();
  const isEmpty = useDndCourseStore((state) => state.materials.length === 0);
  return (
    <button
      type="button"
      className={String.raw`dnd-node dnd-node--upload nodrag tw:relative tw:w-[100%] tw:h-[100%] tw:flex tw:flex-row tw:gap-[16px] tw:p-[20px_20px_16px] tw:border-dashed tw:border-(--dnd-border-strong) tw:rounded-(--dnd-radius) tw:text-(--dnd-text) tw:text-left tw:overflow-visible tw:items-center tw:cursor-pointer tw:[font:inherit] tw:[background:color-mix(in_srgb,_var(--dnd-node)_70%,_transparent)] tw:[border-width:1.5px] tw:hover:border-(--dnd-blue-ink) tw:[&.is-calling]:border-(--dnd-blue-ink) tw:[box-shadow:none] tw:hover:text-(--dnd-blue-ink) tw:[&.is-calling]:text-(--dnd-blue-ink) tw:animate-dnd-pop tw:[transition:border-color_0.15s,_box-shadow_0.15s,_opacity_0.2s,_transform_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.is-calling]:animate-dnd-call tw:[&::before]:absolute tw:[&::before]:left-[12px] tw:[&::before]:right-[12px] tw:[&::before]:top-[-1px] tw:[&::before]:h-[3px] tw:[&::before]:rounded-[0_0_4px_4px] tw:[&::before]:hidden tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:[font:inherit] tw:[.page_.dnd-builder_.dnd-canvas_.react-flow\_\_node:focus-visible_>_&]:focus-visible:[outline-offset:3px] tw:[&::before]:[content:''] tw:[&::before]:[background:var(--dnd-node-stripe,_transparent)] ${isEmpty ? "is-calling" : ""}`}
      onClick={() => pickFiles()}
    >
      <Icon name="upload" size={22} />
      <span className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <strong className="tw:block tw:text-[1.22rem] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          Загрузить материалы
        </strong>
        <small className="tw:text-[1rem] tw:block tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
          Перетащите файлы на холст или нажмите
        </small>
      </span>
    </button>
  );
});

// ───────────── Материал ─────────────
export const MaterialNode = memo(function MaterialNode({
  id,
  data,
  selected,
}: DndNodeProps) {
  const material = useDndCourseStore((state) =>
    state.materials.find((item) => item.id === data.entityId),
  );
  const lessonTitle = useDndCourseStore((state) =>
    material?.lessonId
      ? state.lessons.find((lesson) => lesson.id === material.lessonId)
          ?.title || "Урок"
      : null,
  );
  const selectedMaterialIds = useDndCourseStore(
    useShallow((state) =>
      state.selectedIds
        .filter((item) => item.startsWith("material:"))
        .map((item) => item.slice("material:".length)),
    ),
  );
  const chrome = useNodeChrome(id, "material", material);
  const openInspector = useDndCourseStore((state) => state.openInspector);
  const createLesson = useDndCourseStore(
    (state) => state.createLessonFromMaterials,
  );
  const addToLesson = useDndCourseStore((state) => state.addMaterialsToLesson);
  const retry = useDndCourseStore((state) => state.retryMaterial);
  const { pickFiles, requestDelete } = useDndActions();
  if (!material) return null;

  const status = material.lessonId ? "used" : material.status;
  const statusInfo = MATERIAL_STATUS[status];
  const isReady = material.status === "ready" && !material.lessonId;
  const group =
    selected &&
    selectedMaterialIds.length > 1 &&
    selectedMaterialIds.includes(material.id)
      ? selectedMaterialIds
      : [material.id];

  const lessonItems = (): MenuItem[] => {
    const lessonOptions = useDndCourseStore
      .getState()
      .lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        full:
          getLessonBlocks(lesson).length + group.length > MAX_CONTENT_BLOCKS,
      }));
    return [
      {
        key: "new",
        icon: "plus",
        label:
          group.length > 1
            ? `Новый урок из ${group.length} материалов`
            : "Новый урок",
        onSelect: () => createLesson(group),
      },
      ...(lessonOptions.length
        ? [
            { key: "sep", type: "separator" as const },
            {
              key: "label",
              type: "label" as const,
              label: "Существующий урок",
            },
          ]
        : []),
      ...lessonOptions.map((lesson) => ({
        key: lesson.id,
        icon: "lesson",
        label: lesson.title,
        disabled: lesson.full,
        hint: lesson.full ? `Лимит ${MAX_CONTENT_BLOCKS} блоков` : undefined,
        onSelect: () => addToLesson(lesson.id, group),
      })),
    ];
  };

  return (
    <div
      className={String.raw`dnd-node dnd-node--material tw:relative tw:w-[100%] tw:h-[100%] tw:flex tw:flex-col tw:gap-[10px] tw:p-[20px_20px_16px] tw:border-solid tw:border-(--dnd-border) tw:rounded-(--dnd-radius) tw:text-(--dnd-text) tw:text-left tw:overflow-visible tw:[background:var(--dnd-node)] tw:[border-width:1px] tw:[.page_.dnd-builder_&.is-active]:border-(--dnd-focus) tw:[&.is-error]:border-(--dnd-error) tw:[&.is-drop-ok]:border-(--dnd-ok) tw:[&.is-drop-bad]:border-(--dnd-error) tw:[.page_.dnd-builder_&.is-selected]:border-(--dnd-focus) tw:[box-shadow:var(--dnd-shadow)] tw:animate-dnd-pop tw:[transition:border-color_0.15s,_box-shadow_0.15s,_opacity_0.2s,_transform_0.15s] tw:[--dnd-node-stripe:var(--dnd-blue)] tw:[&.is-dimmed]:opacity-[0.32] tw:[&.is-pending]:opacity-[0.86] tw:[&.is-drop-bad]:cursor-not-allowed tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.is-used]:[background:var(--dnd-node-2)] tw:[.page_.dnd-builder_&.is-selected]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring),_var(--dnd-shadow)] tw:[&.is-highlighted]:[box-shadow:0_0_0_3px_var(--dnd-info-bg),_0_0_0_1px_var(--dnd-info),_var(--dnd-shadow)] tw:[&.is-drop-ok]:[box-shadow:0_0_0_4px_var(--dnd-ok-bg),_var(--dnd-shadow)] tw:[&.is-drop-bad]:[box-shadow:0_0_0_4px_var(--dnd-error-bg),_var(--dnd-shadow)] tw:[&.is-error]:[--dnd-node-stripe:var(--dnd-error)] tw:[&::before]:absolute tw:[&::before]:left-[12px] tw:[&::before]:right-[12px] tw:[&::before]:top-[-1px] tw:[&::before]:h-[3px] tw:[&::before]:rounded-[0_0_4px_4px] tw:[.page_.dnd-builder_.dnd-canvas_.react-flow\_\_node:focus-visible_>_&]:focus-visible:[outline-offset:3px] tw:[&::before]:[content:''] tw:[&::before]:[background:var(--dnd-node-stripe,_transparent)] is-${status} ${chromeClass(chrome, selected)}`}
      aria-label={`Материал ${material.number}: ${material.fileName}. ${statusInfo?.label || ""}`}
      aria-busy={material.status === "uploading"}
    >
      <Handle
        type="source"
        position={Position.Right}
        className="dnd-handle tw:w-[11px] tw:h-[11px] tw:border-solid tw:border-(--dnd-edge) tw:[background:var(--dnd-node)] tw:[border-width:2px] tw:[transition:transform_0.15s,_border-color_0.15s,_background_0.15s] tw:[&.react-flow\_\_handle.connectable:hover]:border-(--dnd-focus) tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.react-flow\_\_handle.connectable:hover]:[transform:translate(var(--dnd-handle-x,_0),_-50%)_scale(1.3)] tw:[&.react-flow\_\_handle-right.connectable:hover]:[--dnd-handle-x:50%]"
        isConnectable={isReady}
      />
      <div className="dnd-node-kicker tw:flex tw:items-center tw:gap-[8px] tw:min-h-[28px] tw:text-(--dnd-muted) tw:text-[1.02rem] tw:font-[700] tw:tracking-[0.02em] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <Icon name="file" size={15} />
        <span className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          #{material.number}
        </span>
        <span className="dnd-chip tw:inline-flex tw:items-center tw:p-[2px_9px] tw:rounded-[6px] tw:text-[0.92rem] tw:font-[700] tw:tracking-[0.04em] tw:text-(--dnd-muted) tw:[background:var(--dnd-panel-2)] tw:[border:1px_solid_var(--dnd-border)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          {material.fileKind || "Файл"}
        </span>
        <span className="dnd-node-kicker-end tw:ml-[auto] tw:inline-flex tw:items-center tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <StatusPill
            tone={statusInfo?.tone || "muted"}
            busy={material.status === "uploading"}
            icon={
              status === "error"
                ? "alert"
                : status === "used"
                  ? "link"
                  : status === "ready"
                    ? "check"
                    : null
            }
          >
            <span
              className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
              data-tip={statusInfo?.label}
            >
              {statusInfo?.short}
            </span>
          </StatusPill>
        </span>
      </div>
      <h3
        className="dnd-node-title dnd-node-title--sm tw:text-[1.36rem] tw:leading-[1.3] tw:tracking-[-0.008em] tw:font-[700] tw:text-(--dnd-heading) tw:overflow-hidden tw:wrap-anywhere tw:[display:-webkit-box] tw:[-webkit-line-clamp:1] tw:[-webkit-box-orient:vertical] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.36rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.3] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
        data-tip={material.fileName}
      >
        {material.fileName}
      </h3>
      {material.status === "error" ? (
        <p className="dnd-node-error">
          {material.error || "Не удалось обработать документ."}
        </p>
      ) : material.status === "uploading" ? (
        <p className="dnd-node-excerpt tw:[.page_.dnd-builder_&]:m-[0] tw:[.page_.dnd-builder_&]:text-[1.1rem] tw:[.page_.dnd-builder_&]:leading-[1.38] tw:[.page_.dnd-builder_&]:text-(--dnd-muted) tw:[.page_.dnd-builder_&]:overflow-hidden tw:[.page_.dnd-builder_&]:wrap-anywhere tw:[.page_.dnd-builder_&]:[display:-webkit-box] tw:[.page_.dnd-builder_&]:[-webkit-line-clamp:2] tw:[.page_.dnd-builder_&]:[-webkit-box-orient:vertical]">
          Загружаем файл и превращаем его в текст…
        </p>
      ) : (
        <p className="dnd-node-excerpt tw:tracking-[0.012em] tw:m-[0] tw:text-(--dnd-muted) tw:overflow-hidden tw:wrap-anywhere tw:[&&&]:text-[1.1rem] tw:[&&&]:leading-[1.38] tw:[display:-webkit-box] tw:[-webkit-line-clamp:2] tw:[-webkit-box-orient:vertical] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.1rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.38] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
          {material.lessonId ? (
            <>
              <Icon name="link" size={13} /> В уроке «{lessonTitle}»
            </>
          ) : (
            markdownExcerpt(material.markdown, 110) || "Пустой документ"
          )}
        </p>
      )}
      <div
        className="dnd-node-actions dnd-node-toolbar tw:m-[0] tw:flex tw:items-center tw:gap-[4px] tw:absolute tw:left-[50%] tw:top-[calc(100%_+_8px)] tw:z-[5] tw:w-[max-content] tw:p-[6px] tw:rounded-[14px] tw:opacity-[0] tw:pointer-events-none tw:[.page_.dnd-builder_.dnd-node--course_&]:gap-[8px] tw:[transition:opacity_0.15s,_transform_0.15s] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-panel)] tw:[box-shadow:var(--dnd-shadow-lg)] tw:[.page_.dnd-builder_.dnd-node.is-selected_&]:opacity-[1] tw:[.page_.dnd-builder_.dnd-node.is-selected_&]:pointer-events-auto tw:[transform:translate(-50%,_-4px)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:has([aria-expanded=true])]:opacity-[1] tw:[.page_.dnd-builder_.react-flow\_\_node:hover_&]:opacity-[1] tw:[.page_.dnd-builder_.react-flow\_\_node:focus-within_&]:opacity-[1] tw:[.page_.dnd-builder_.react-flow\_\_node:focus-visible_&]:opacity-[1] tw:[&:has([aria-expanded=true])]:pointer-events-auto tw:[.page_.dnd-builder_.react-flow\_\_node:hover_&]:pointer-events-auto tw:[.page_.dnd-builder_.react-flow\_\_node:focus-within_&]:pointer-events-auto tw:[.page_.dnd-builder_.react-flow\_\_node:focus-visible_&]:pointer-events-auto tw:[.page_.dnd-builder_.dnd-node.is-selected_&]:[transform:translate(-50%,_0)] tw:[&:has([aria-expanded=true])]:[transform:translate(-50%,_0)] tw:[.page_.dnd-builder_.react-flow\_\_node:hover_&]:[transform:translate(-50%,_0)] tw:[.page_.dnd-builder_.react-flow\_\_node:focus-within_&]:[transform:translate(-50%,_0)] tw:[.page_.dnd-builder_.react-flow\_\_node:focus-visible_&]:[transform:translate(-50%,_0)] tw:[&::before]:absolute tw:[&::before]:left-[0] tw:[&::before]:right-[0] tw:[&::before]:top-[-11px] tw:[&::before]:h-[11px] tw:[&::before]:[content:'']"
        role="toolbar"
        aria-label="Действия с материалом"
      >
        <NodeButton
          icon="eye"
          label="Открыть материал"
          onClick={() => openInspector(nodeId.material(material.id), "content")}
          disabled={material.status === "uploading"}
        />
        <NodeButton
          icon="sparkles"
          label="ИИ-редактор материала"
          onClick={() => openInspector(nodeId.material(material.id), "ai")}
          disabled={material.status !== "ready"}
        />
        {material.status === "error" ? (
          <NodeButton
            icon="retry"
            label="Повторить загрузку"
            onClick={() => {
              if (material.tooBig || !retry(material.id)) {
                pickFiles({ replaceMaterialId: material.id });
              }
            }}
          />
        ) : (
          <ActionMenu
            label="Добавить в урок"
            icon="lesson"
            items={lessonItems}
            disabled={!isReady}
            iconSize={20}
          />
        )}
        <span className="dnd-node-actions-gap tw:flex-[1] tw:hidden tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]" />
        {material.size ? (
          <small className="dnd-node-size tw:text-[0.92rem] tw:text-(--dnd-muted) tw:mr-[4px] tw:hidden tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.92rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            {formatBytes(material.size)}
          </small>
        ) : null}
        <NodeButton
          icon="trash"
          tone="danger"
          label={
            material.lessonId
              ? "Материал уже в уроке — удалить нельзя"
              : "Удалить материал"
          }
          onClick={() => requestDelete(nodeId.material(material.id))}
          disabled={
            Boolean(material.lessonId) || material.status === "uploading"
          }
        />
      </div>
    </div>
  );
});

// ───────────── Урок ─────────────
export const LessonNode = memo(function LessonNode({
  id,
  data,
  selected,
}: DndNodeProps) {
  const lesson = useDndCourseStore((state) =>
    state.lessons.find((item) => item.id === data.entityId),
  );
  const placement = useDndCourseStore(
    useShallow((state) => {
      const module = state.modules.find((item) =>
        item.lessonIds.includes(data.entityId),
      );
      return {
        moduleId: module?.id || null,
        moduleTitle: module?.title || null,
        index: module ? module.lessonIds.indexOf(data.entityId) : -1,
        total: module ? module.lessonIds.length : 0,
      };
    }),
  );
  const selectedLessonIds = useDndCourseStore(
    useShallow((state) =>
      state.selectedIds
        .filter((item) => item.startsWith("lesson:"))
        .map((item) => item.slice("lesson:".length)),
    ),
  );
  const chrome = useNodeChrome(id, "lesson", lesson);
  const openInspector = useDndCourseStore((state) => state.openInspector);
  const moveLessonBy = useDndCourseStore((state) => state.moveLessonBy);
  const moveToModule = useDndCourseStore((state) => state.moveLessonToModule);
  const openModuleDialog = useDndCourseStore((state) => state.openModuleDialog);
  const contentStatus = useDndCourseStore(
    (state) => state.saveStatus[`${id}:content`],
  );
  const { requestDelete, previewLesson } = useDndActions();
  if (!lesson) return null;

  const blocks = getLessonBlocks(lesson).length;
  const fill = getLessonFill(lesson);
  const group =
    selected &&
    selectedLessonIds.length > 1 &&
    selectedLessonIds.includes(lesson.id)
      ? selectedLessonIds
      : [lesson.id];

  const moduleItems = (): MenuItem[] => {
    const moduleOptions = [...useDndCourseStore.getState().modules]
      .sort((a, b) => a.order - b.order)
      .map((module) => ({ id: module.id, title: module.title }));
    return [
      {
        key: "new",
        icon: "plus",
        label:
          group.length > 1
            ? `Новый модуль из ${group.length} уроков`
            : "Новый модуль…",
        onSelect: () => openModuleDialog(group),
      },
      ...(moduleOptions.length
        ? [
            { key: "sep", type: "separator" as const },
            {
              key: "label",
              type: "label" as const,
              label: "Существующий модуль",
            },
          ]
        : []),
      ...moduleOptions.map((module) => ({
        key: module.id,
        icon: "module",
        label: module.title,
        disabled: module.id === placement.moduleId,
        hint: module.id === placement.moduleId ? "Урок уже здесь" : undefined,
        onSelect: () => moveToModule(lesson.id, module.id),
      })),
    ];
  };

  return (
    <div
      className={String.raw`dnd-node dnd-node--lesson tw:relative tw:w-[100%] tw:h-[100%] tw:flex tw:flex-col tw:gap-[10px] tw:p-[20px_20px_16px] tw:border-solid tw:border-(--dnd-border) tw:rounded-(--dnd-radius) tw:text-(--dnd-text) tw:text-left tw:overflow-visible tw:[background:var(--dnd-node)] tw:[border-width:1px] tw:[.page_.dnd-builder_&.is-active]:border-(--dnd-focus) tw:[&.is-drop-ok]:border-(--dnd-ok) tw:[&.is-drop-bad]:border-(--dnd-error) tw:[.page_.dnd-builder_&.is-selected]:border-(--dnd-focus) tw:[box-shadow:var(--dnd-shadow)] tw:animate-dnd-pop tw:[transition:border-color_0.15s,_box-shadow_0.15s,_opacity_0.2s,_transform_0.15s] tw:[--dnd-node-stripe:var(--dnd-accent)] tw:[&.is-dimmed]:opacity-[0.32] tw:[&.is-pending]:opacity-[0.86] tw:[&.is-drop-bad]:cursor-not-allowed tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.is-selected]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring),_var(--dnd-shadow)] tw:[&.is-highlighted]:[box-shadow:0_0_0_3px_var(--dnd-info-bg),_0_0_0_1px_var(--dnd-info),_var(--dnd-shadow)] tw:[&.is-drop-ok]:[box-shadow:0_0_0_4px_var(--dnd-ok-bg),_var(--dnd-shadow)] tw:[&.is-drop-bad]:[box-shadow:0_0_0_4px_var(--dnd-error-bg),_var(--dnd-shadow)] tw:[&::before]:absolute tw:[&::before]:left-[12px] tw:[&::before]:right-[12px] tw:[&::before]:top-[-1px] tw:[&::before]:h-[3px] tw:[&::before]:rounded-[0_0_4px_4px] tw:[.page_.dnd-builder_.dnd-canvas_.react-flow\_\_node:focus-visible_>_&]:focus-visible:[outline-offset:3px] tw:[&::before]:[content:''] tw:[&::before]:[background:var(--dnd-node-stripe,_transparent)] ${placement.moduleId ? "is-nested" : "is-free"} ${chromeClass(chrome, selected)}`}
      aria-label={`Урок «${lesson.title}». ${placement.moduleTitle ? `Модуль «${placement.moduleTitle}», позиция ${placement.index + 1}` : "Без модуля"}. ${countLabel(blocks, WORDS.block)}.`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="dnd-handle tw:w-[11px] tw:h-[11px] tw:border-solid tw:border-(--dnd-edge) tw:[background:var(--dnd-node)] tw:[border-width:2px] tw:[.page_.dnd-builder_&.react-flow\_\_handle.connectingto.valid]:border-(--dnd-ok) tw:[.page_.dnd-builder_&.react-flow\_\_handle.connectingto]:border-(--dnd-error) tw:[transition:transform_0.15s,_border-color_0.15s,_background_0.15s] tw:[.page_.dnd-builder_&.react-flow\_\_handle.connectingto.valid]:[background:var(--dnd-ok)] tw:[.page_.dnd-builder_&.react-flow\_\_handle.connectingto]:[background:var(--dnd-error-bg)] tw:[&.react-flow\_\_handle.connectable:hover]:border-(--dnd-focus) tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.react-flow\_\_handle.connectable:hover]:[transform:translate(var(--dnd-handle-x,_0),_-50%)_scale(1.3)] tw:[&.react-flow\_\_handle-left.connectable:hover]:[--dnd-handle-x:-50%]"
        isConnectable
      />
      <Handle
        type="source"
        position={Position.Right}
        className="dnd-handle tw:w-[11px] tw:h-[11px] tw:border-solid tw:border-(--dnd-edge) tw:[background:var(--dnd-node)] tw:[border-width:2px] tw:[transition:transform_0.15s,_border-color_0.15s,_background_0.15s] tw:[&.react-flow\_\_handle.connectable:hover]:border-(--dnd-focus) tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.react-flow\_\_handle.connectable:hover]:[transform:translate(var(--dnd-handle-x,_0),_-50%)_scale(1.3)] tw:[&.react-flow\_\_handle-right.connectable:hover]:[--dnd-handle-x:50%]"
        isConnectable
      />
      <div className="dnd-node-kicker tw:flex tw:items-center tw:gap-[8px] tw:min-h-[28px] tw:text-(--dnd-muted) tw:text-[1.02rem] tw:font-[700] tw:tracking-[0.02em] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <Icon name="lesson" size={15} />
        Урок
        {placement.moduleId ? (
          <span
            className="dnd-chip tw:inline-flex tw:items-center tw:p-[2px_9px] tw:rounded-[6px] tw:text-[0.92rem] tw:font-[700] tw:tracking-[0.04em] tw:text-(--dnd-muted) tw:[background:var(--dnd-panel-2)] tw:[border:1px_solid_var(--dnd-border)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
            data-tip={`Позиция в модуле: ${placement.index + 1}`}
          >
            №{placement.index + 1}
          </span>
        ) : null}
        <span className="dnd-node-kicker-end tw:ml-[auto] tw:inline-flex tw:items-center tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          {placement.moduleId ? null : (
            <span
              className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
              data-tip="Черновик: урок сохранится на сервере, когда вы добавите его в модуль"
            >
              <StatusPill tone="warn" icon="alert">
                Черновик
              </StatusPill>
            </span>
          )}
          {contentStatus === "saving" ? (
            <Spinner size={12} label="Сохраняем контент" />
          ) : null}
        </span>
      </div>
      <h3
        className="dnd-node-title dnd-node-title--sm tw:text-[1.36rem] tw:leading-[1.3] tw:tracking-[-0.008em] tw:font-[700] tw:text-(--dnd-heading) tw:overflow-hidden tw:wrap-anywhere tw:[display:-webkit-box] tw:[-webkit-line-clamp:1] tw:[-webkit-box-orient:vertical] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.36rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.3] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
        data-tip={lesson.title}
      >
        {lesson.title}
      </h3>
      <p className="dnd-node-meta tw:leading-[1.72] tw:tracking-[0.012em] tw:m-[0] tw:flex tw:flex-wrap tw:gap-[4px_12px] tw:text-(--dnd-muted) tw:[&&&]:text-[1.1rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.1rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
        <span
          className="tw:inline-flex tw:items-center tw:gap-[4px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
          data-tip="Контентные блоки"
        >
          {blocks}/{MAX_CONTENT_BLOCKS} {WORDS.block[2]}
        </span>
        <span className="tw:inline-flex tw:items-center tw:gap-[4px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <Icon name="clock" size={13} />
          {lesson.estimatedTimeMinutes
            ? `${lesson.estimatedTimeMinutes} мин`
            : "—"}
        </span>
        {(lesson.materialIds || []).length ? (
          <span
            className="tw:inline-flex tw:items-center tw:gap-[4px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
            data-tip="Материалы, из которых собран урок"
          >
            <Icon name="file" size={13} />
            {countLabel(lesson.materialIds.length, WORDS.material)}
          </span>
        ) : null}
      </p>
      <FillBar value={fill} label="Заполненность урока" />
      <div
        className="dnd-node-actions dnd-node-toolbar tw:m-[0] tw:flex tw:items-center tw:gap-[4px] tw:absolute tw:left-[50%] tw:top-[calc(100%_+_8px)] tw:z-[5] tw:w-[max-content] tw:p-[6px] tw:rounded-[14px] tw:opacity-[0] tw:pointer-events-none tw:[.page_.dnd-builder_.dnd-node--course_&]:gap-[8px] tw:[transition:opacity_0.15s,_transform_0.15s] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-panel)] tw:[box-shadow:var(--dnd-shadow-lg)] tw:[.page_.dnd-builder_.dnd-node.is-selected_&]:opacity-[1] tw:[.page_.dnd-builder_.dnd-node.is-selected_&]:pointer-events-auto tw:[transform:translate(-50%,_-4px)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:has([aria-expanded=true])]:opacity-[1] tw:[.page_.dnd-builder_.react-flow\_\_node:hover_&]:opacity-[1] tw:[.page_.dnd-builder_.react-flow\_\_node:focus-within_&]:opacity-[1] tw:[.page_.dnd-builder_.react-flow\_\_node:focus-visible_&]:opacity-[1] tw:[&:has([aria-expanded=true])]:pointer-events-auto tw:[.page_.dnd-builder_.react-flow\_\_node:hover_&]:pointer-events-auto tw:[.page_.dnd-builder_.react-flow\_\_node:focus-within_&]:pointer-events-auto tw:[.page_.dnd-builder_.react-flow\_\_node:focus-visible_&]:pointer-events-auto tw:[.page_.dnd-builder_.dnd-node.is-selected_&]:[transform:translate(-50%,_0)] tw:[&:has([aria-expanded=true])]:[transform:translate(-50%,_0)] tw:[.page_.dnd-builder_.react-flow\_\_node:hover_&]:[transform:translate(-50%,_0)] tw:[.page_.dnd-builder_.react-flow\_\_node:focus-within_&]:[transform:translate(-50%,_0)] tw:[.page_.dnd-builder_.react-flow\_\_node:focus-visible_&]:[transform:translate(-50%,_0)] tw:[&::before]:absolute tw:[&::before]:left-[0] tw:[&::before]:right-[0] tw:[&::before]:top-[-11px] tw:[&::before]:h-[11px] tw:[&::before]:[content:'']"
        role="toolbar"
        aria-label="Действия с уроком"
      >
        <NodeButton
          icon="edit"
          label="Редактировать контент урока (с ИИ)"
          onClick={() => openInspector(id, "content")}
        />
        <NodeButton
          icon="settings"
          label="Название, описание и цели урока"
          onClick={() => openInspector(id, "main")}
        />
        <NodeButton
          icon="eye"
          label={
            lesson.isLocal
              ? "Урок ещё не на сервере — добавьте его в модуль, чтобы посмотреть"
              : "Посмотреть урок как студент"
          }
          onClick={() => previewLesson?.(lesson.id)}
          disabled={lesson.isLocal}
        />
        <ActionMenu
          label="Переместить в модуль"
          icon="module"
          items={moduleItems}
          iconSize={20}
        />
        {placement.moduleId ? (
          <>
            <NodeButton
              icon="arrowUp"
              label="Переместить выше"
              onClick={() => moveLessonBy(lesson.id, -1)}
              disabled={placement.index <= 0 || chrome.pending}
            />
            <NodeButton
              icon="arrowDown"
              label="Переместить ниже"
              onClick={() => moveLessonBy(lesson.id, 1)}
              disabled={
                placement.index >= placement.total - 1 || chrome.pending
              }
            />
          </>
        ) : null}
        <span className="dnd-node-actions-gap tw:flex-[1] tw:hidden tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]" />
        <NodeButton
          icon="trash"
          tone="danger"
          label="Удалить урок"
          onClick={() => requestDelete(id)}
          disabled={chrome.pending}
        />
      </div>
    </div>
  );
});

// ───────────── Модуль ─────────────
export const ModuleNode = memo(function ModuleNode({
  id,
  data,
  selected,
}: DndNodeProps) {
  const module = useDndCourseStore((state) =>
    state.modules.find((item) => item.id === data.entityId),
  );
  const position = useDndCourseStore(
    useShallow((state) => {
      const ordered = [...state.modules].sort((a, b) => a.order - b.order);
      return {
        index: ordered.findIndex((item) => item.id === data.entityId),
        total: ordered.length,
      };
    }),
  );
  const chrome = useNodeChrome(id, "module", module);
  const orderPending = useDndCourseStore((state) =>
    Boolean(
      state.pending["order:modules"] || state.pending[`order:${data.entityId}`],
    ),
  );
  const openInspector = useDndCourseStore((state) => state.openInspector);
  const moveModuleBy = useDndCourseStore((state) => state.moveModuleBy);
  const { requestDelete } = useDndActions();
  if (!module) return null;

  const lessons = module.lessonIds.length;
  return (
    <div
      className={String.raw`dnd-node dnd-node--module tw:relative tw:w-[100%] tw:h-[100%] tw:flex tw:flex-col tw:gap-[0] tw:p-[0] tw:border-dashed tw:border-(--dnd-border-strong) tw:rounded-(--dnd-radius) tw:text-(--dnd-text) tw:text-left tw:overflow-visible tw:[background:color-mix(in_srgb,_var(--dnd-node)_55%,_transparent)] tw:[border-width:1.5px] tw:[.page_.dnd-builder_&.is-selected]:border-solid tw:[.page_.dnd-builder_&.is-selected]:border-(--dnd-focus) tw:[.page_.dnd-builder_&.is-active]:border-(--dnd-focus) tw:[&.is-drop-ok]:border-(--dnd-ok) tw:[&.is-drop-bad]:border-(--dnd-error) tw:[box-shadow:none] tw:animate-dnd-pop tw:[transition:border-color_0.15s,_box-shadow_0.15s,_opacity_0.2s,_transform_0.15s] tw:[&.is-dimmed]:opacity-[0.32] tw:[&.is-pending]:opacity-[0.86] tw:[&.is-drop-bad]:cursor-not-allowed tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.is-selected]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring),_var(--dnd-shadow)] tw:[&.is-highlighted]:[box-shadow:0_0_0_3px_var(--dnd-info-bg),_0_0_0_1px_var(--dnd-info),_var(--dnd-shadow)] tw:[&.is-drop-ok]:[box-shadow:0_0_0_4px_var(--dnd-ok-bg),_var(--dnd-shadow)] tw:[&.is-drop-bad]:[box-shadow:0_0_0_4px_var(--dnd-error-bg),_var(--dnd-shadow)] tw:[.page_.dnd-builder_.dnd-canvas_.react-flow\_\_node.dragging_&]:[box-shadow:var(--dnd-shadow-lg)] tw:[&::before]:absolute tw:[&::before]:left-[12px] tw:[&::before]:right-[12px] tw:[&::before]:top-[-1px] tw:[&::before]:h-[3px] tw:[&::before]:rounded-[0_0_4px_4px] tw:[&::before]:hidden tw:[.page_.dnd-builder_.dnd-canvas_.react-flow\_\_node:focus-visible_>_&]:focus-visible:[outline-offset:3px] tw:[&::before]:[content:''] tw:[&::before]:[background:var(--dnd-node-stripe,_transparent)] ${chromeClass(chrome, selected)}`}
      style={{ width: MODULE_LAYOUT.width, height: moduleHeight(lessons) }}
      aria-label={`Модуль ${position.index + 1}: «${module.title}». ${countLabel(lessons, WORDS.lesson)}.`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="dnd-handle tw:w-[11px] tw:h-[11px] tw:border-solid tw:border-(--dnd-edge) tw:[background:var(--dnd-node)] tw:[border-width:2px] tw:[transition:transform_0.15s,_border-color_0.15s,_background_0.15s] tw:[&.react-flow\_\_handle.connectable:hover]:border-(--dnd-focus) tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.react-flow\_\_handle.connectable:hover]:[transform:translate(var(--dnd-handle-x,_0),_-50%)_scale(1.3)] tw:[&.react-flow\_\_handle-left.connectable:hover]:[--dnd-handle-x:-50%]"
        isConnectable
      />
      <Handle
        type="source"
        position={Position.Right}
        className="dnd-handle tw:w-[11px] tw:h-[11px] tw:[background:var(--dnd-node)] tw:[border:2px_solid_var(--dnd-edge)] tw:[transition:transform_0.15s,_border-color_0.15s,_background_0.15s] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.react-flow\_\_handle:not(.connectable)]:opacity-[0.5]"
        isConnectable={false}
      />
      <header className="dnd-module-head tw:grid tw:gap-[10px] tw:p-[20px_20px_14px] tw:rounded-[calc(var(--dnd-radius)_-_2px)_calc(var(--dnd-radius)_-_2px)_0_0] tw:min-h-[160px] tw:[border-bottom:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <div className="dnd-node-kicker tw:flex tw:items-center tw:gap-[8px] tw:min-h-[28px] tw:text-(--dnd-muted) tw:text-[1.02rem] tw:font-[700] tw:tracking-[0.02em] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <Icon name="module" size={15} />
          Модуль {position.index + 1}
          <span className="dnd-node-kicker-end tw:ml-[auto] tw:inline-flex tw:items-center tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {orderPending ? (
              <Spinner size={12} label="Сохраняем порядок" />
            ) : null}
            {countLabel(lessons, WORDS.lesson)}
          </span>
        </div>
        <h3
          className="dnd-node-title dnd-node-title--sm tw:text-[1.36rem] tw:leading-[1.3] tw:tracking-[-0.008em] tw:font-[700] tw:text-(--dnd-heading) tw:overflow-hidden tw:wrap-anywhere tw:[display:-webkit-box] tw:[-webkit-line-clamp:1] tw:[-webkit-box-orient:vertical] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.36rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.3] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
          data-tip={module.title}
        >
          {module.title}
        </h3>
        <div className="dnd-module-toolbar tw:flex tw:items-center tw:gap-[4px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <FillBar value={getModuleFill(module)} label="Заполненность модуля" />
          <span className="dnd-module-buttons tw:inline-flex tw:items-center tw:gap-[4px] tw:opacity-[0] tw:pointer-events-none tw:[transition:opacity_0.15s] tw:no-hover:opacity-[1] tw:[.page_.dnd-builder_.dnd-node.is-selected_&]:opacity-[1] tw:no-hover:pointer-events-auto tw:[.page_.dnd-builder_.dnd-node.is-selected_&]:pointer-events-auto tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.react-flow\_\_node:hover_&]:opacity-[1] tw:[.page_.dnd-builder_.react-flow\_\_node:focus-within_&]:opacity-[1] tw:[.page_.dnd-builder_.react-flow\_\_node:hover_&]:pointer-events-auto tw:[.page_.dnd-builder_.react-flow\_\_node:focus-within_&]:pointer-events-auto">
            <NodeButton
              icon="edit"
              label="Редактировать модуль"
              onClick={() => openInspector(id, "main")}
            />
            <NodeButton
              icon="arrowUp"
              label="Модуль выше"
              onClick={() => moveModuleBy(module.id, -1)}
              disabled={position.index <= 0 || orderPending}
            />
            <NodeButton
              icon="arrowDown"
              label="Модуль ниже"
              onClick={() => moveModuleBy(module.id, 1)}
              disabled={position.index >= position.total - 1 || orderPending}
            />
            <NodeButton
              icon="trash"
              tone="danger"
              label="Удалить модуль"
              onClick={() => requestDelete(id)}
              disabled={chrome.pending}
            />
          </span>
        </div>
      </header>
      <footer
        className={`dnd-module-drop tw:absolute tw:left-[20px] tw:right-[20px] tw:bottom-[16px] tw:h-[50px] tw:flex tw:items-center tw:justify-center tw:gap-[6px] tw:rounded-[10px] tw:border-dashed tw:border-(--dnd-border) tw:text-(--dnd-muted) tw:text-[1.04rem] tw:font-[600] tw:[border-width:1.5px] tw:[.page_.dnd-builder_.dnd-node--module.is-drop-ok_&]:border-(--dnd-ok) tw:[.page_.dnd-builder_.dnd-node--module.is-drop-ok_&]:text-(--dnd-ok) tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-node--module.is-drop-ok_&]:[background:var(--dnd-ok-bg)] ${lessons ? "" : "is-empty"}`}
      >
        <Icon name="plus" size={14} />
        {lessons ? "Перетащите сюда ещё урок" : "Перетащите урок в модуль"}
      </footer>
    </div>
  );
});

export const nodeTypes = {
  course: CourseNode,
  upload: UploadNode,
  material: MaterialNode,
  lesson: LessonNode,
  module: ModuleNode,
};
