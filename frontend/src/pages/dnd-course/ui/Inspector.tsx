import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useShallow } from "zustand/react/shallow";
import {
  ChatButton,
  ChatCard,
  ChatComposer,
  ChatEmpty,
  ChatMarkdown,
  ChatMessage,
  ChatNotice,
  ChatThread,
  ChatTyping,
} from "@/shared/ui/ai-chat";
import { LessonContentEditor } from "@/features/edit-lesson-content";
import {
  createAgentConversationKey,
  useAgentStore,
} from "@/entities/agent-chat";
import { DIFFICULTY_OPTIONS, MATERIAL_STATUS } from "../config/constants";
import {
  countLabel,
  formatBytes,
  getLessonBlocks,
  MAX_CONTENT_BLOCKS,
  nodeId,
  parseNodeId,
  WORDS,
} from "../lib/helpers";
import { Icon, Spinner } from "./icons";
import { getProgress, getStats } from "../model/selectors";
import { formFromEntity, hasFile, useDndCourseStore } from "../model/store";
import type {
  DndCourse,
  DndLesson,
  DndMaterial,
  DndModule,
  NodeType,
} from "../model/types";
import { SaveIndicator, StatusPill, useDndActions } from "./common";

const TABS: Record<string, { id: string; label: string }[]> = {
  material: [
    { id: "content", label: "Контент" },
    { id: "ai", label: "ИИ-редактор" },
    { id: "props", label: "Свойства" },
  ],
  lesson: [
    { id: "main", label: "Основное" },
    { id: "content", label: "Контент" },
    { id: "goals", label: "Цели" },
    { id: "settings", label: "Настройки" },
  ],
  module: [
    { id: "main", label: "Основное" },
    { id: "lessons", label: "Уроки" },
  ],
  course: [
    { id: "main", label: "Карточка" },
    { id: "summary", label: "Сводка" },
  ],
};

const TYPE_META: Record<string, { icon: string; label: string }> = {
  material: { icon: "file", label: "Материал" },
  lesson: { icon: "lesson", label: "Урок" },
  module: { icon: "module", label: "Модуль" },
  course: { icon: "course", label: "Курс" },
};

/** Атрибуты, которые Field передаёт своему полю ввода. */
interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

function Field({
  label,
  error,
  hint,
  children,
  required = false,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: FieldControlProps) => ReactNode;
  required?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div
      className={`dnd-field tw:grid tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.has-error_input]:border-(--dnd-error) tw:[.page_.dnd-builder_&.has-error_textarea]:border-(--dnd-error) ${error ? "has-error" : ""}`}
    >
      <label
        className="tw:text-[0.8rem] tw:font-[700] tw:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
        htmlFor={id}
      >
        {label}
        {required ? (
          <span
            className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
            aria-hidden="true"
          >
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })}
      {hint ? (
        <small
          id={hintId}
          className="dnd-field-hint tw:text-[0.76rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.76rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.76rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.76rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
        >
          {hint}
        </small>
      ) : null}
      {error ? (
        <small
          id={errorId}
          className="dnd-field-error tw:[.page_.dnd-builder_&]:m-[0] tw:[.page_.dnd-builder_&]:text-(--dnd-error) tw:[.page_.dnd-builder_&]:text-[0.78rem] tw:[.page_.dnd-builder_&]:font-[650]"
          role="alert"
        >
          {error}
        </small>
      ) : null}
    </div>
  );
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function useEntityForm(key: string, type: NodeType, entity: unknown) {
  const stored = useDndCourseStore((state) => state.forms[key]);
  const updateForm = useDndCourseStore((state) => state.updateForm);
  const values = stored || formFromEntity(type, entity);
  const change = (field: string) => (event: ChangeEvent<FieldElement>) =>
    updateForm(key, type, entity, { [field]: event.target.value });
  return { values, change, dirty: Boolean(stored) };
}

function SaveBar({
  statusKey,
  onSave,
  onReset,
  dirty,
  disabled,
  label = "Сохранить",
}: {
  statusKey: string;
  onSave: () => void;
  onReset: () => void;
  dirty: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const status = useDndCourseStore((state) => state.saveStatus[statusKey]);
  const error = useDndCourseStore((state) => state.saveErrors[statusKey]);
  const pending = useDndCourseStore((state) =>
    Boolean(state.pending[statusKey]),
  );
  return (
    <div className="dnd-savebar tw:grid tw:gap-[8px] tw:sticky tw:bottom-[-24px] tw:m-[0_-14px_-24px] tw:p-[12px_14px_16px] tw:[background:linear-gradient(180deg,_transparent,_var(--dnd-panel)_22%)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
      {error ? (
        <p
          className="dnd-field-error tw:[.page_.dnd-builder_&]:m-[0] tw:[.page_.dnd-builder_&]:text-(--dnd-error) tw:[.page_.dnd-builder_&]:text-[0.78rem] tw:[.page_.dnd-builder_&]:font-[650]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="dnd-savebar-row tw:flex tw:items-center tw:gap-[8px] tw:flex-wrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <SaveIndicator status={status} error={error} />
        <span className="dnd-node-actions-gap tw:flex-[1] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]" />
        {dirty ? (
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
            onClick={onReset}
            disabled={pending}
          >
            Отменить
          </button>
        ) : null}
        <button
          type="button"
          className="dnd-btn dnd-btn--solid dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-text) tw:text-(--dnd-panel) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:var(--dnd-text)] tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&&]:border-(--dnd-text)"
          onClick={onSave}
          disabled={disabled || pending || !dirty}
          aria-busy={pending}
        >
          {pending ? <Spinner size={13} /> : <Icon name="check" size={15} />}
          {pending ? "Сохраняем…" : label}
        </button>
      </div>
    </div>
  );
}

// ───────────── Материал ─────────────
function MaterialInspector({
  material,
  tab,
}: {
  material: DndMaterial;
  tab: string;
}) {
  const course = useDndCourseStore((state) => state.course);
  const lesson = useDndCourseStore((state) =>
    material.lessonId
      ? state.lessons.find((item) => item.id === material.lessonId)
      : null,
  );
  const allLessons = useDndCourseStore((state) => state.lessons);
  const lessons = useMemo(
    () =>
      allLessons.map((item) => ({
        id: item.id,
        title: item.title,
        full: getLessonBlocks(item).length >= MAX_CONTENT_BLOCKS,
      })),
    [allLessons],
  );
  const updateMarkdown = useDndCourseStore(
    (state) => state.updateMaterialMarkdown,
  );
  const askAi = useDndCourseStore((state) => state.askMaterialAi);
  const applyProposal = useDndCourseStore((state) => state.applyProposal);
  const rejectProposal = useDndCourseStore((state) => state.rejectProposal);
  const createLesson = useDndCourseStore(
    (state) => state.createLessonFromMaterials,
  );
  const addToLesson = useDndCourseStore((state) => state.addMaterialsToLesson);
  const retry = useDndCourseStore((state) => state.retryMaterial);
  const { pickFiles, requestDelete } = useDndActions();
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [targetLesson, setTargetLesson] = useState("");
  const conversationKey = createAgentConversationKey(
    "editor",
    course?.id,
    `manual:${material.id}`,
  );
  const conversation = useAgentStore(
    (state) => state.conversations[conversationKey],
  );
  const aiBusy = conversation?.status === "loading";
  const aiError = material.aiError || conversation?.error || "";
  const messages = conversation?.messages || [];
  const lastUserMessage = [...messages]
    .reverse()
    .find((item) => item.role === "user");
  const isReady = material.status === "ready";

  const send = () => {
    const text = prompt.trim();
    if (!text || aiBusy) return;
    setPrompt("");
    askAi(material.id, text);
  };

  if (tab === "ai") {
    return (
      <div className="dnd-ai tw:flex tw:flex-col tw:h-[min(640px,_calc(100vh_-_240px))] tw:min-h-[380px] tw:-mx-[4px]">
        {!isReady ? (
          <ChatNotice tone="info" className="tw:mx-[4px]">
            ИИ-редактор станет доступен, когда материал будет обработан.
          </ChatNotice>
        ) : null}
        <ChatThread
          busy={aiBusy}
          scrollKey={`${messages.length}:${aiBusy}:${Boolean(material.proposal)}:${aiError}`}
          centered={messages.length === 0 && !aiBusy && !material.proposal}
          label="Переписка с ИИ-редактором"
          className="tw:px-[4px]!"
        >
          {messages.length === 0 && !aiBusy && !material.proposal ? (
            <ChatEmpty
              title="Что поменять в материале?"
              text="Я подготовлю правку — исходный текст не изменится, пока вы её не примените."
            />
          ) : null}
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              text={message.text}
            />
          ))}
          {aiBusy ? <ChatTyping label="Готовлю правку…" /> : null}
          {material.proposal ? (
            <ChatCard
              className="dnd-ai-proposal"
              title="Предложение ИИ"
              actions={
                <>
                  <ChatButton
                    variant="primary"
                    size="sm"
                    onClick={() => applyProposal(material.id)}
                  >
                    <Icon name="check" size={14} />
                    Применить
                  </ChatButton>
                  <ChatButton
                    size="sm"
                    onClick={() => rejectProposal(material.id)}
                  >
                    Не применять
                  </ChatButton>
                </>
              }
            >
              <ChatMarkdown className="tw:max-h-[320px] tw:overflow-y-auto">
                {material.proposal}
              </ChatMarkdown>
            </ChatCard>
          ) : null}
          {aiError ? (
            <ChatNotice
              tone="error"
              actions={
                lastUserMessage && !aiBusy ? (
                  <ChatButton
                    size="sm"
                    onClick={() => askAi(material.id, lastUserMessage.text)}
                  >
                    <Icon name="retry" size={14} />
                    Повторить
                  </ChatButton>
                ) : null
              }
            >
              {aiError}
            </ChatNotice>
          ) : null}
        </ChatThread>
        <ChatComposer
          className="tw:px-[4px]! tw:pb-[4px]!"
          id={`ai-${material.id}`}
          value={prompt}
          onChange={setPrompt}
          onSubmit={send}
          busy={aiBusy}
          disabled={!isReady}
          placeholder={
            aiBusy
              ? "Дождитесь ответа ИИ…"
              : "Например: сократи до тезисов и добавь пример"
          }
          ariaLabel="Запрос к ИИ-редактору"
          sendLabel="Отправить запрос ИИ"
        />
      </div>
    );
  }
  if (tab === "props") {
    const status = material.lessonId ? "used" : material.status;
    return (
      <div className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <dl className="dnd-props tw:grid tw:grid-cols-[90px_minmax(0,_1fr)] tw:gap-[8px_12px] tw:m-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <dt className="tw:text-[0.8rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            Файл
          </dt>
          <dd
            className="tw:text-[0.84rem] tw:m-[0] tw:wrap-anywhere tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            title={material.fileName}
          >
            {material.fileName}
          </dd>
          <dt className="tw:text-[0.8rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            Тип
          </dt>
          <dd className="tw:text-[0.84rem] tw:m-[0] tw:wrap-anywhere tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            {material.fileKind}
          </dd>
          {material.size ? (
            <>
              <dt className="tw:text-[0.8rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
                Размер
              </dt>
              <dd className="tw:text-[0.84rem] tw:m-[0] tw:wrap-anywhere tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
                {formatBytes(material.size)}
              </dd>
            </>
          ) : null}
          <dt className="tw:text-[0.8rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            Статус
          </dt>
          <dd className="tw:text-[0.84rem] tw:m-[0] tw:wrap-anywhere tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            <StatusPill
              tone={MATERIAL_STATUS[status]?.tone}
              busy={material.status === "uploading"}
            >
              {MATERIAL_STATUS[status]?.label}
            </StatusPill>
          </dd>
          <dt className="tw:text-[0.8rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            Урок
          </dt>
          <dd className="tw:text-[0.84rem] tw:m-[0] tw:wrap-anywhere tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            {lesson ? lesson.title : "Не добавлен"}
          </dd>
        </dl>
        {material.status === "error" ? (
          <div
            className="dnd-inline-error tw:[.page_.dnd-builder_&_>_span]:flex-[1_1_180px] tw:[.page_.dnd-builder_&_>_span]:min-w-[0] tw:[.page_.dnd-builder_&_>_span]:wrap-anywhere"
            role="alert"
          >
            <Icon name="alert" size={16} />
            <span>{material.error}</span>
            <button
              type="button"
              className="dnd-btn dnd-btn--ghost dnd-btn--sm"
              onClick={() => {
                if (
                  material.tooBig ||
                  !hasFile(material.id) ||
                  !retry(material.id)
                )
                  pickFiles({ replaceMaterialId: material.id });
              }}
            >
              <Icon name="retry" size={14} />
              {hasFile(material.id) && !material.tooBig
                ? "Повторить"
                : "Выбрать файл"}
            </button>
          </div>
        ) : null}
        {isReady && !material.lessonId ? (
          <div className="dnd-stack dnd-stack--tight tw:grid tw:min-w-[0] tw:[&&&&]:gap-[8px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            <button
              type="button"
              className="dnd-btn dnd-btn--solid dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-text) tw:text-(--dnd-panel) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:var(--dnd-text)] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-text) tw:[&:hover:not(:disabled)]:[&&]:border-(--dnd-text) tw:[&:hover:not(:disabled)]:[&&&]:border-(--dnd-text) tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-text) tw:[&:active:not(:disabled)]:[transform:translateY(1px)] tw:[&:hover:not(:disabled)]:[box-shadow:0_4px_12px_rgba(0,_0,_0,_0.16)]"
              onClick={() => createLesson([material.id])}
            >
              <Icon name="plus" size={15} />
              Создать урок из материала
            </button>
            {lessons.length ? (
              <div className="dnd-inline-form tw:flex tw:gap-[8px] tw:flex-wrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                <label
                  className="dnd-visually-hidden tw:absolute! tw:w-[1px]! tw:h-[1px]! tw:p-[0]! tw:m-[-1px]! tw:overflow-hidden! tw:whitespace-nowrap! tw:[clip:rect(0_0_0_0)]! tw:[border:0]! tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
                  htmlFor={`to-lesson-${material.id}`}
                >
                  Добавить в существующий урок
                </label>
                <select
                  className="tw:text-[0.88rem] tw:leading-[1.45] tw:w-[auto] tw:min-h-[40px] tw:p-[9px_12px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:flex-[1_1_180px] tw:[font-family:inherit] tw:[border-width:1px] tw:focus:border-(--dnd-focus) tw:[background:var(--dnd-node)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:focus:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.88rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.45] tw:focus:focus-visible:[&&&]:[outline:none]"
                  id={`to-lesson-${material.id}`}
                  value={targetLesson}
                  onChange={(event) => setTargetLesson(event.target.value)}
                >
                  <option
                    className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
                    value=""
                  >
                    Добавить в урок…
                  </option>
                  {lessons.map((item) => (
                    <option
                      className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
                      key={item.id}
                      value={item.id}
                      disabled={item.full}
                    >
                      {item.title}
                      {item.full ? ` (лимит ${MAX_CONTENT_BLOCKS})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="dnd-btn dnd-btn--ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
                  disabled={!targetLesson}
                  onClick={() =>
                    addToLesson(targetLesson, [material.id]).then(
                      (ok) => ok && setTargetLesson(""),
                    )
                  }
                >
                  Добавить
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className="dnd-btn dnd-btn--danger-ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[&&&&]:justify-start tw:[&&&&]:pl-[6px] tw:[border-width:1px] tw:[&&&&]:border-[transparent] tw:[background:transparent] tw:[&&&&]:text-(--dnd-error) tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:[&&&&]:border-[transparent] tw:[&:hover:not(:disabled)]:[background:var(--dnd-error-bg)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
          onClick={() => requestDelete(nodeId.material(material.id))}
          disabled={
            Boolean(material.lessonId) || material.status === "uploading"
          }
          title={
            material.lessonId ? "Материал уже в уроке" : "Удалить материал"
          }
        >
          <Icon name="trash" size={15} />
          Удалить материал
        </button>
      </div>
    );
  }

  return (
    <div className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
      {material.status === "uploading" ? (
        <p className="dnd-muted" role="status">
          <Spinner size={14} /> Обрабатываем документ…
        </p>
      ) : null}
      {material.status === "error" ? (
        <div
          className="dnd-inline-error tw:[.page_.dnd-builder_&_>_span]:flex-[1_1_180px] tw:[.page_.dnd-builder_&_>_span]:min-w-[0] tw:[.page_.dnd-builder_&_>_span]:wrap-anywhere"
          role="alert"
        >
          <Icon name="alert" size={16} />
          <span>{material.error}</span>
        </div>
      ) : null}
      {isReady ? (
        <>
          <div
            className="dnd-segmented tw:inline-flex tw:p-[3px] tw:gap-[2px] tw:rounded-[10px] tw:[background:var(--dnd-panel-2)] tw:[border:1px_solid_var(--dnd-border)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
            role="group"
            aria-label="Режим просмотра"
          >
            <button
              type="button"
              aria-pressed={!editing}
              className={`tw:text-[0.8rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:gap-[6px] tw:min-h-[30px] tw:p-[0_10px] tw:rounded-[8px] tw:text-(--dnd-muted) tw:font-[650] tw:cursor-pointer tw:[border:0] tw:[background:transparent] tw:[&.is-on]:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.is-on]:[background:var(--dnd-node)] tw:[&.is-on]:[box-shadow:0_1px_3px_rgba(0,_0,_0,_0.12)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] ${!editing ? "is-on" : ""}`}
              onClick={() => setEditing(false)}
            >
              <Icon name="eye" size={15} /> Просмотр
            </button>
            <button
              type="button"
              aria-pressed={editing}
              className={`tw:text-[0.8rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:gap-[6px] tw:min-h-[30px] tw:p-[0_10px] tw:rounded-[8px] tw:text-(--dnd-muted) tw:font-[650] tw:cursor-pointer tw:[border:0] tw:[background:transparent] tw:[&.is-on]:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.is-on]:[background:var(--dnd-node)] tw:[&.is-on]:[box-shadow:0_1px_3px_rgba(0,_0,_0,_0.12)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] ${editing ? "is-on" : ""}`}
              onClick={() => setEditing(true)}
            >
              <Icon name="edit" size={15} /> Markdown
            </button>
          </div>
          {material.lessonId ? (
            <p className="dnd-muted">
              <Icon name="info" size={14} /> Материал уже в уроке «
              {lesson?.title}». Правки здесь не меняют урок — редактируйте его
              контент в инспекторе урока.
            </p>
          ) : null}
          {editing ? (
            <>
              <label
                className="dnd-visually-hidden tw:absolute! tw:w-[1px]! tw:h-[1px]! tw:p-[0]! tw:m-[-1px]! tw:overflow-hidden! tw:whitespace-nowrap! tw:[clip:rect(0_0_0_0)]! tw:[border:0]!"
                htmlFor={`md-${material.id}`}
              >
                Markdown материала
              </label>
              <textarea
                id={`md-${material.id}`}
                className="dnd-md-editor nowheel tw:[.page_.dnd-builder_&]:w-[100%] tw:[.page_.dnd-builder_&]:min-h-[46dvh] tw:[.page_.dnd-builder_&]:p-[9px_12px] tw:[.page_.dnd-builder_&]:rounded-[10px] tw:[.page_.dnd-builder_&]:border-solid tw:[.page_.dnd-builder_&]:border-(--dnd-border) tw:[.page_.dnd-builder_&]:text-(--dnd-text) tw:[.page_.dnd-builder_&]:text-[0.82rem] tw:[.page_.dnd-builder_&]:leading-[1.45] tw:[.page_.dnd-builder_&]:resize-y tw:[.page_.dnd-builder_&]:[border-width:1px] tw:[.page_.dnd-builder_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_&]:[font-style:inherit] tw:[.page_.dnd-builder_&]:[font-variant:inherit] tw:[.page_.dnd-builder_&]:[font-weight:inherit] tw:[.page_.dnd-builder_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_&]:[font-family:ui-monospace,_SFMono-Regular,_Menlo,_Consolas,_monospace] tw:[.page_.dnd-builder_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[.page_.dnd-builder_&:focus]:[outline:none] tw:[.page_.dnd-builder_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
                value={material.markdown}
                onChange={(event) =>
                  updateMarkdown(material.id, event.target.value)
                }
                spellCheck
              />
              <small className="dnd-field-hint">
                Изменения сохраняются в черновике автоматически.
              </small>
            </>
          ) : (
            <div className="dnd-markdown nowheel tw:max-h-[min(56dvh,_640px)] tw:overflow-y-auto tw:p-[12px_14px] tw:rounded-[12px] tw:text-[0.86rem] tw:leading-[1.55] tw:wrap-anywhere tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&_:where(h1,h2,h3,h4)]:m-[0.8em_0_0.4em] tw:[.page_.dnd-builder_&_:where(h1,h2,h3,h4)]:text-[1em] tw:[.page_.dnd-builder_&_:where(h1,h2,h3,h4)]:font-[800] tw:[.page_.dnd-builder_&_:where(p,li)]:text-[0.86rem] tw:[.page_.dnd-builder_&_:where(p,li)]:leading-[1.55] tw:[.page_.dnd-builder_&_pre]:overflow-x-auto tw:[.page_.dnd-builder_&_pre]:p-[10px] tw:[.page_.dnd-builder_&_pre]:rounded-[8px] tw:[.page_.dnd-builder_&_pre]:[background:var(--dnd-panel-2)] tw:[.page_.dnd-builder_&_table]:block tw:[.page_.dnd-builder_&_table]:overflow-x-auto tw:[.page_.dnd-builder_&_table]:[border-collapse:collapse] tw:[.page_.dnd-builder_&_:where(td,th)]:[border:1px_solid_var(--dnd-border)] tw:[.page_.dnd-builder_&_:where(td,th)]:p-[4px_8px]">
              {material.markdown.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {material.markdown}
                </ReactMarkdown>
              ) : (
                <p className="dnd-muted">Документ пустой.</p>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ───────────── Урок ─────────────
function LessonInspector({ lesson, tab }: { lesson: DndLesson; tab: string }) {
  const key = nodeId.lesson(lesson.id);
  const course = useDndCourseStore((state) => state.course);
  const { values, change, dirty } = useEntityForm(key, "lesson", lesson);
  const save = useDndCourseStore((state) => state.saveLessonMeta);
  const resetForm = useDndCourseStore((state) => state.resetForm);
  const setLessonContent = useDndCourseStore((state) => state.setLessonContent);
  const contentStatus = useDndCourseStore(
    (state) => state.saveStatus[`${key}:content`],
  );
  const contentError = useDndCourseStore(
    (state) => state.saveErrors[`${key}:content`],
  );
  const saveContentNow = useDndCourseStore(
    (state) => state.saveLessonContentNow,
  );
  const placement = useDndCourseStore(
    useShallow((state) => {
      const module = state.modules.find((item) =>
        item.lessonIds.includes(lesson.id),
      );
      return {
        moduleId: module?.id || "",
        index: module ? module.lessonIds.indexOf(lesson.id) : -1,
        total: module?.lessonIds.length || 0,
      };
    }),
  );
  const allModules = useDndCourseStore((state) => state.modules);
  const modules = useMemo(
    () => [...allModules].sort((a, b) => a.order - b.order),
    [allModules],
  );
  const materials = useDndCourseStore(
    useShallow((state) =>
      state.materials.filter((item) => item.lessonId === lesson.id),
    ),
  );
  const moveToModule = useDndCourseStore((state) => state.moveLessonToModule);
  const moveBy = useDndCourseStore((state) => state.moveLessonBy);
  const openModuleDialog = useDndCourseStore((state) => state.openModuleDialog);
  const pending = useDndCourseStore((state) => Boolean(state.pending[key]));
  const { requestDelete } = useDndActions();
  const [moveTarget, setMoveTarget] = useState("");
  const titleError =
    dirty && !values.title.trim() ? "Укажите название урока" : "";
  const descriptionError =
    dirty && !values.description.trim() ? "Добавьте описание урока" : "";
  const saveBar = (
    <SaveBar
      statusKey={key}
      dirty={dirty}
      onSave={() => save(lesson.id)}
      onReset={() => resetForm(key)}
      disabled={Boolean(titleError || descriptionError)}
    />
  );

  if (tab === "content") {
    return (
      <div className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <div className="dnd-savebar-row tw:flex tw:items-center tw:gap-[8px] tw:flex-wrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <SaveIndicator
            status={contentStatus || "saved"}
            error={contentError}
          />
          <span className="dnd-node-actions-gap tw:flex-[1] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]" />
          <small className="dnd-muted tw:text-[0.84rem] tw:m-[0] tw:text-(--dnd-muted) tw:flex tw:gap-[6px] tw:items-start tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            {getLessonBlocks(lesson).length}/{MAX_CONTENT_BLOCKS}{" "}
            {WORDS.block[2]}
          </small>
        </div>
        {contentStatus === "error" ? (
          <div
            className="dnd-inline-error tw:[.page_.dnd-builder_&_>_span]:flex-[1_1_180px] tw:[.page_.dnd-builder_&_>_span]:min-w-[0] tw:[.page_.dnd-builder_&_>_span]:wrap-anywhere"
            role="alert"
          >
            <Icon name="alert" size={16} />
            <span>{contentError}</span>
            <button
              type="button"
              className="dnd-btn dnd-btn--ghost dnd-btn--sm"
              onClick={() => saveContentNow(lesson.id)}
            >
              <Icon name="retry" size={14} /> Повторить
            </button>
          </div>
        ) : null}
        <div className="dnd-lesson-editor nowheel tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <LessonContentEditor
            courseId={course?.id ?? ""}
            lesson={{
              id: lesson.id,
              contentBlocks: getLessonBlocks(lesson),
              markdown: "",
            }}
            onChange={(changes) =>
              setLessonContent(lesson.id, changes.contentBlocks || [])
            }
            contentLabel="Теория"
            blocksLabel="Блоки урока"
            showInsertControls={false}
          />
        </div>
      </div>
    );
  }

  if (tab === "goals") {
    return (
      <div className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <Field
          label="Цели обучения"
          hint="Каждая цель с новой строки. Что студент сможет сделать после урока?"
        >
          {(props) => (
            <textarea
              className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[.page_.dnd-builder_.dnd-field_&]:resize-y tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
              {...props}
              rows={8}
              value={values.learningObjectives}
              onChange={change("learningObjectives")}
              placeholder={"Объяснить, что такое…\nПрименить … на практике"}
            />
          )}
        </Field>
        {saveBar}
      </div>
    );
  }

  if (tab === "settings") {
    return (
      <div className="dnd-stack">
        <section className="dnd-subsection tw:grid tw:gap-[8px] tw:pb-[14px] tw:[border-bottom:1px_solid_var(--dnd-border)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <h4 className="tw:text-[0.86rem] tw:m-[0] tw:font-[750] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.86rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            Модуль
          </h4>
          <p className="dnd-muted tw:text-[0.84rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:m-[0] tw:text-(--dnd-muted) tw:flex tw:gap-[6px] tw:items-start tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            {placement.moduleId
              ? `Сейчас: «${modules.find((item) => item.id === placement.moduleId)?.title}», позиция ${placement.index + 1} из ${placement.total}.`
              : "Урок пока в черновике: на сервер он попадёт, когда вы добавите его в модуль."}
          </p>
          <div className="dnd-inline-form tw:flex tw:gap-[8px] tw:flex-wrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            <label
              className="dnd-visually-hidden tw:absolute! tw:w-[1px]! tw:h-[1px]! tw:p-[0]! tw:m-[-1px]! tw:overflow-hidden! tw:whitespace-nowrap! tw:[clip:rect(0_0_0_0)]! tw:[border:0]! tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
              htmlFor={`move-${lesson.id}`}
            >
              Переместить в модуль
            </label>
            <select
              className="tw:text-[0.88rem] tw:leading-[1.45] tw:w-[auto] tw:min-h-[40px] tw:p-[9px_12px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:flex-[1_1_180px] tw:[font-family:inherit] tw:[border-width:1px] tw:focus:border-(--dnd-focus) tw:[background:var(--dnd-node)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:focus:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.88rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.45] tw:focus:focus-visible:[&&&]:[outline:none]"
              id={`move-${lesson.id}`}
              value={moveTarget}
              onChange={(event) => setMoveTarget(event.target.value)}
            >
              <option
                className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
                value=""
              >
                Переместить в модуль…
              </option>
              {modules.map((item) => (
                <option
                  className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
                  key={item.id}
                  value={item.id}
                  disabled={item.id === placement.moduleId}
                >
                  {item.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="dnd-btn dnd-btn--ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
              disabled={!moveTarget || pending}
              onClick={() =>
                moveToModule(lesson.id, moveTarget).then(() =>
                  setMoveTarget(""),
                )
              }
            >
              Переместить
            </button>
          </div>
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
            onClick={() => openModuleDialog([lesson.id])}
          >
            <Icon name="plus" size={15} /> Новый модуль с этим уроком
          </button>
          {placement.moduleId ? (
            <div className="dnd-inline-form tw:[.page_.dnd-builder_&]:flex tw:[.page_.dnd-builder_&]:gap-[8px] tw:[.page_.dnd-builder_&]:flex-wrap">
              <button
                type="button"
                className="dnd-btn dnd-btn--ghost dnd-btn--sm"
                onClick={() => moveBy(lesson.id, -1)}
                disabled={placement.index <= 0 || pending}
              >
                <Icon name="arrowUp" size={15} /> Выше
              </button>
              <button
                type="button"
                className="dnd-btn dnd-btn--ghost dnd-btn--sm"
                onClick={() => moveBy(lesson.id, 1)}
                disabled={placement.index >= placement.total - 1 || pending}
              >
                <Icon name="arrowDown" size={15} /> Ниже
              </button>
            </div>
          ) : null}
        </section>
        <section className="dnd-subsection tw:grid tw:gap-[8px] tw:pb-[14px] tw:[border-bottom:1px_solid_var(--dnd-border)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <h4 className="tw:text-[0.86rem] tw:m-[0] tw:font-[750] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.86rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
            Материалы урока
          </h4>
          {materials.length ? (
            <ul className="dnd-mini-list tw:[.page_.dnd-builder_&]:m-[0] tw:[.page_.dnd-builder_&]:p-[0] tw:[.page_.dnd-builder_&]:grid tw:[.page_.dnd-builder_&]:gap-[6px] tw:[.page_.dnd-builder_&]:[list-style:none] tw:[.page_.dnd-builder_&_li]:flex tw:[.page_.dnd-builder_&_li]:items-center tw:[.page_.dnd-builder_&_li]:gap-[8px] tw:[.page_.dnd-builder_&_li]:text-[0.84rem] tw:[.page_.dnd-builder_&_li]:min-w-[0] tw:[.page_.dnd-builder_&_span]:overflow-hidden tw:[.page_.dnd-builder_&_span]:text-ellipsis tw:[.page_.dnd-builder_&_span]:whitespace-nowrap">
              {materials.map((item) => (
                <li key={item.id}>
                  <Icon name="file" size={14} />
                  <span title={item.fileName}>{item.fileName}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dnd-muted tw:text-[0.84rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:m-[0] tw:text-(--dnd-muted) tw:flex tw:gap-[6px] tw:items-start tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              Материалы не привязаны — контент добавлен вручную.
            </p>
          )}
        </section>
        <button
          type="button"
          className="dnd-btn dnd-btn--danger-ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[&&&&]:justify-start tw:[&&&&]:pl-[6px] tw:[border-width:1px] tw:[&&&&]:border-[transparent] tw:[background:transparent] tw:[&&&&]:text-(--dnd-error) tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:[&&&&]:border-[transparent] tw:[&:hover:not(:disabled)]:[background:var(--dnd-error-bg)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
          onClick={() => requestDelete(key)}
          disabled={pending}
        >
          <Icon name="trash" size={15} /> Удалить урок
        </button>
      </div>
    );
  }

  return (
    <div className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
      <Field label="Название" required error={titleError}>
        {(props) => (
          <input
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            value={values.title}
            onChange={change("title")}
            maxLength={200}
          />
        )}
      </Field>
      <Field label="Описание" required error={descriptionError}>
        {(props) => (
          <textarea
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[.page_.dnd-builder_.dnd-field_&]:resize-y tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            rows={4}
            value={values.description}
            onChange={change("description")}
          />
        )}
      </Field>
      <Field label="Длительность, минут" hint="Сколько времени займёт урок">
        {(props) => (
          <input
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            type="number"
            inputMode="numeric"
            min="1"
            max="600"
            value={values.estimatedTimeMinutes}
            onChange={change("estimatedTimeMinutes")}
          />
        )}
      </Field>
      {saveBar}
    </div>
  );
}

// ───────────── Модуль ─────────────
function ModuleInspector({ module, tab }: { module: DndModule; tab: string }) {
  const key = nodeId.module(module.id);
  const { values, change, dirty } = useEntityForm(key, "module", module);
  const save = useDndCourseStore((state) => state.saveModuleMeta);
  const resetForm = useDndCourseStore((state) => state.resetForm);
  const lessons = useDndCourseStore(
    useShallow((state) =>
      module.lessonIds
        .map((id) => state.lessons.find((item) => item.id === id))
        .filter((item): item is DndLesson => Boolean(item)),
    ),
  );
  const position = useDndCourseStore(
    useShallow((state) => {
      const ordered = [...state.modules].sort((a, b) => a.order - b.order);
      return {
        index: ordered.findIndex((item) => item.id === module.id),
        total: ordered.length,
      };
    }),
  );
  const orderPending = useDndCourseStore((state) =>
    Boolean(
      state.pending["order:modules"] || state.pending[`order:${module.id}`],
    ),
  );
  const moveModuleBy = useDndCourseStore((state) => state.moveModuleBy);
  const moveLessonBy = useDndCourseStore((state) => state.moveLessonBy);
  const openInspector = useDndCourseStore((state) => state.openInspector);
  const { requestDelete } = useDndActions();
  const titleError =
    dirty && !values.title.trim() ? "Укажите название модуля" : "";
  const descriptionError =
    dirty && !values.description.trim() ? "Добавьте описание модуля" : "";

  if (tab === "lessons") {
    return (
      <div className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <p className="dnd-muted tw:text-[0.84rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:m-[0] tw:text-(--dnd-muted) tw:flex tw:gap-[6px] tw:items-start tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
          Модуль {position.index + 1} из {position.total}. Порядок уроков
          меняется кнопками или перетаскиванием на холсте.
        </p>
        <div className="dnd-inline-form tw:flex tw:gap-[8px] tw:flex-wrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
            onClick={() => moveModuleBy(module.id, -1)}
            disabled={position.index <= 0 || orderPending}
          >
            <Icon name="arrowUp" size={15} /> Модуль выше
          </button>
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
            onClick={() => moveModuleBy(module.id, 1)}
            disabled={position.index >= position.total - 1 || orderPending}
          >
            <Icon name="arrowDown" size={15} /> Модуль ниже
          </button>
        </div>
        {lessons.length ? (
          <ol className="dnd-order-list tw:m-[0] tw:p-[0] tw:grid tw:gap-[6px] tw:[list-style:none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {lessons.map((lesson, index) => (
              <li
                className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:grid tw:grid-cols-[26px_minmax(0,_1fr)_auto_auto] tw:items-center tw:gap-[6px] tw:p-[6px_8px] tw:rounded-[10px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
                key={lesson.id}
              >
                <span className="dnd-order-num tw:inline-grid tw:min-w-[24px] tw:h-[24px] tw:p-[0_4px] tw:rounded-[7px] tw:text-(--dnd-muted) tw:text-[0.74rem] tw:font-[800] tw:[place-items:center] tw:[background:var(--dnd-panel-2)] tw:[font-variant-numeric:tabular-nums] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                  {index + 1}
                </span>
                <button
                  type="button"
                  className="dnd-link tw:text-[0.96rem] tw:leading-[1.45] tw:p-[0] tw:text-(--dnd-blue-ink) tw:font-[650] tw:cursor-pointer tw:text-left tw:min-w-[0] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:[border:0] tw:[background:none] tw:[text-decoration:underline] tw:[text-underline-offset:3px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
                  onClick={() =>
                    openInspector(nodeId.lesson(lesson.id), "main")
                  }
                  title={lesson.title}
                >
                  {lesson.title}
                </button>
                <button
                  type="button"
                  className="dnd-icon-btn dnd-icon-btn--sm tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)]"
                  onClick={() => moveLessonBy(lesson.id, -1)}
                  disabled={index === 0 || orderPending}
                  aria-label={`Переместить «${lesson.title}» выше`}
                  title="Выше"
                >
                  <Icon name="arrowUp" size={14} />
                </button>
                <button
                  type="button"
                  className="dnd-icon-btn dnd-icon-btn--sm tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)]"
                  onClick={() => moveLessonBy(lesson.id, 1)}
                  disabled={index === lessons.length - 1 || orderPending}
                  aria-label={`Переместить «${lesson.title}» ниже`}
                  title="Ниже"
                >
                  <Icon name="arrowDown" size={14} />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="dnd-muted">
            В модуле пока нет уроков. Перетащите урок на модуль или используйте
            «Переместить в модуль» на карточке урока.
          </p>
        )}
        <button
          type="button"
          className="dnd-btn dnd-btn--danger-ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[&&&&]:justify-start tw:[&&&&]:pl-[6px] tw:[border-width:1px] tw:[&&&&]:border-[transparent] tw:[background:transparent] tw:[&&&&]:text-(--dnd-error) tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:[&&&&]:border-[transparent] tw:[&:hover:not(:disabled)]:[background:var(--dnd-error-bg)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
          onClick={() => requestDelete(key)}
        >
          <Icon name="trash" size={15} /> Удалить модуль
        </button>
      </div>
    );
  }

  return (
    <div className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
      <Field label="Название" required error={titleError}>
        {(props) => (
          <input
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            value={values.title}
            onChange={change("title")}
            maxLength={200}
          />
        )}
      </Field>
      <Field label="Описание" required error={descriptionError}>
        {(props) => (
          <textarea
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[.page_.dnd-builder_.dnd-field_&]:resize-y tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            rows={4}
            value={values.description}
            onChange={change("description")}
          />
        )}
      </Field>
      <Field label="Цели обучения" hint="Каждая цель с новой строки">
        {(props) => (
          <textarea
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[.page_.dnd-builder_.dnd-field_&]:resize-y tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            rows={5}
            value={values.learningObjectives}
            onChange={change("learningObjectives")}
          />
        )}
      </Field>
      <SaveBar
        statusKey={key}
        dirty={dirty}
        onSave={() => save(module.id)}
        onReset={() => resetForm(key)}
        disabled={Boolean(titleError || descriptionError)}
      />
    </div>
  );
}

// ───────────── Курс ─────────────
function CourseInspector({ course, tab }: { course: DndCourse; tab: string }) {
  const { values, change, dirty } = useEntityForm("course", "course", course);
  const save = useDndCourseStore((state) => state.saveCourse);
  const resetForm = useDndCourseStore((state) => state.resetForm);
  const stats = useDndCourseStore(useShallow(getStats));
  const progress = useDndCourseStore((state) => getProgress(state).percent);
  const openFinish = useDndCourseStore((state) => state.openFinish);
  const titleError =
    dirty && !values.title.trim() ? "Укажите название курса" : "";
  const descriptionError =
    dirty && !values.description.trim() ? "Добавьте описание курса" : "";

  if (tab === "summary") {
    return (
      <div className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <dl className="dnd-stats tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[8px] tw:m-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&_.is-ok]:border-(--dnd-ok) tw:[.page_.dnd-builder_&_.is-ok]:[background:var(--dnd-ok-bg)]">
          <div className="tw:p-[10px_12px] tw:rounded-[12px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            <dt className="tw:text-[0.74rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.74rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              Материалы
            </dt>
            <dd className="tw:text-[1.15rem] tw:m-[2px_0_0] tw:font-[800] tw:[font-variant-numeric:tabular-nums] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.15rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              {stats.materials}
            </dd>
          </div>
          <div className="tw:p-[10px_12px] tw:rounded-[12px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            <dt className="tw:text-[0.74rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.74rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              Уроки
            </dt>
            <dd className="tw:text-[1.15rem] tw:m-[2px_0_0] tw:font-[800] tw:[font-variant-numeric:tabular-nums] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.15rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              {stats.lessons}
            </dd>
          </div>
          <div className="tw:p-[10px_12px] tw:rounded-[12px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            <dt className="tw:text-[0.74rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.74rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              Модули
            </dt>
            <dd className="tw:text-[1.15rem] tw:m-[2px_0_0] tw:font-[800] tw:[font-variant-numeric:tabular-nums] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.15rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              {stats.modules}
            </dd>
          </div>
          <div
            className={`tw:p-[10px_12px] tw:rounded-[12px] tw:border-solid tw:border-(--dnd-border) tw:[border-width:1px] tw:[&.is-warn]:border-(--dnd-warn) tw:[background:var(--dnd-node)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.is-warn]:[background:var(--dnd-warn-bg)] ${stats.unassignedLessons ? "is-warn" : ""}`}
          >
            <dt className="tw:text-[0.74rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.74rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              Уроки без модуля
            </dt>
            <dd className="tw:text-[1.15rem] tw:m-[2px_0_0] tw:font-[800] tw:[font-variant-numeric:tabular-nums] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.15rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
              {stats.unassignedLessons}
            </dd>
          </div>
        </dl>
        <div className="dnd-course-progress tw:flex tw:items-center tw:gap-[10px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <div className="dnd-course-progress-track tw:flex-[1] tw:h-[12px] tw:rounded-[999px] tw:overflow-hidden tw:[background:var(--dnd-border)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            <i
              className="tw:block tw:h-[100%] tw:rounded-[inherit] tw:[background:linear-gradient(90deg,_var(--dnd-accent),_var(--dnd-blue))] tw:[transition:width_0.4s_var(--dnd-ease)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <strong className="tw:text-[1.1rem] tw:min-w-[36px] tw:text-right tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {progress}%
          </strong>
        </div>
        <button
          type="button"
          className="dnd-btn dnd-btn--accent tw:text-[0.875rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[38px] tw:p-[0_16px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-accent) tw:text-[#241c24] tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:var(--dnd-accent)] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.875rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.875rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.875rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&&]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-accent-ink) tw:[&:active:not(:disabled)]:[transform:translateY(1px)] tw:[&:hover:not(:disabled)]:[box-shadow:0_6px_18px_rgba(203,_170,_203,_0.45)]"
          onClick={openFinish}
        >
          <Icon name="flag" size={16} /> Итоговая проверка
        </button>
      </div>
    );
  }

  return (
    <div className="dnd-stack tw:grid tw:gap-[14px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
      <Field label="Название курса" required error={titleError}>
        {(props) => (
          <input
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            value={values.title}
            onChange={change("title")}
            maxLength={200}
          />
        )}
      </Field>
      <Field label="Описание" required error={descriptionError}>
        {(props) => (
          <textarea
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[.page_.dnd-builder_.dnd-field_&]:resize-y tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            rows={4}
            value={values.description}
            onChange={change("description")}
          />
        )}
      </Field>
      <Field label="Сложность">
        {(props) => (
          <select
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            value={values.difficulty}
            onChange={change("difficulty")}
          >
            {DIFFICULTY_OPTIONS.map((option) => (
              <option
                className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Теги" hint="Через запятую: python, backend, junior">
        {(props) => (
          <input
            className="tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:text-[0.88rem] tw:[.page_.dnd-builder_.dnd-field_&]:leading-[1.45] tw:[.page_.dnd-builder_.dnd-field_&]:w-[100%] tw:[.page_.dnd-builder_.dnd-field_&]:min-h-[40px] tw:[.page_.dnd-builder_.dnd-field_&]:p-[9px_12px] tw:[.page_.dnd-builder_.dnd-field_&]:rounded-[10px] tw:[.page_.dnd-builder_.dnd-field_&]:border-solid tw:[.page_.dnd-builder_.dnd-field_&]:border-(--dnd-border) tw:[.page_.dnd-builder_.dnd-field_&]:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page_.dnd-builder_.dnd-field_&]:[font-family:inherit] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-field_&]:[border-width:1px] tw:[.page_.dnd-builder_.dnd-field_&:focus]:border-(--dnd-focus) tw:[.page_.dnd-builder_.dnd-field_&]:[background:var(--dnd-node)] tw:[.page_.dnd-builder_.dnd-field_&]:[font-style:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-variant:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-weight:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[font-stretch:inherit] tw:[.page_.dnd-builder_.dnd-field_&]:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[outline:none] tw:[.page_.dnd-builder_.dnd-field_&:focus]:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)]"
            {...props}
            value={values.tags}
            onChange={change("tags")}
          />
        )}
      </Field>
      <SaveBar
        statusKey="course"
        dirty={dirty}
        onSave={save}
        onReset={() => resetForm("course")}
        disabled={Boolean(titleError || descriptionError)}
      />
    </div>
  );
}

export function Inspector({
  variant = "side",
  resizeHandle = null,
}: {
  variant?: string;
  resizeHandle?: ReactNode;
}) {
  const activeNodeId = useDndCourseStore((state) => state.activeNodeId);
  const inspector = useDndCourseStore((state) => state.inspector);
  const setTab = useDndCourseStore((state) => state.setInspectorTab);
  const closeInspector = useDndCourseStore((state) => state.closeInspector);
  const { type, entityId } = parseNodeId(activeNodeId);
  const entity = useDndCourseStore((state) => {
    if (type === "course") return state.course;
    if (type === "material")
      return state.materials.find((item) => item.id === entityId);
    if (type === "lesson")
      return state.lessons.find((item) => item.id === entityId);
    if (type === "module")
      return state.modules.find((item) => item.id === entityId);
    return null;
  });
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (inspector.open && variant === "sheet") headingRef.current?.focus();
  }, [activeNodeId, inspector.open, variant]);

  if (!inspector.open || !entity || !type || !TABS[type]) return null;
  const tabs = TABS[type];
  const tab =
    (tabs.some((item) => item.id === inspector.tab) && inspector.tab) ||
    tabs[0].id;
  const meta = TYPE_META[type];
  const title =
    type === "material"
      ? (entity as DndMaterial).fileName
      : (entity as DndCourse | DndLesson | DndModule).title;

  return (
    <aside
      className={`dnd-inspector tw:flex tw:flex-col tw:min-h-[0] tw:min-w-[0] tw:[background:var(--dnd-panel)] tw:[border-left:1px_solid_var(--dnd-border)] tw:[&.dnd-inspector--side]:relative tw:[&.dnd-inspector--drawer]:absolute tw:[&.dnd-inspector--sheet]:fixed tw:[&.dnd-inspector--drawer]:z-[30] tw:[&.dnd-inspector--sheet]:z-[900] tw:[&.dnd-inspector--drawer]:top-[0] tw:[&.dnd-inspector--drawer]:right-[0] tw:[&.dnd-inspector--drawer]:bottom-[0] tw:[&.dnd-inspector--sheet]:top-[8dvh] tw:[&.dnd-inspector--sheet]:right-[0] tw:[&.dnd-inspector--sheet]:bottom-[0] tw:[&.dnd-inspector--sheet]:left-[0] tw:[&.dnd-inspector--drawer]:w-[min(440px,_92%)] tw:[&.dnd-inspector--sheet]:rounded-[18px_18px_0_0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.dnd-inspector--sheet]:[border-left:0] tw:[&.dnd-inspector--drawer]:animate-dnd-slide-right tw:[&.dnd-inspector--sheet]:animate-dnd-sheet tw:[&.dnd-inspector--drawer]:[box-shadow:var(--dnd-shadow-lg)] tw:[&.dnd-inspector--sheet]:[box-shadow:var(--dnd-shadow-lg)] tw:[&.dnd-inspector--sheet]:[border-top:1px_solid_var(--dnd-border)] tw:[&:not(.dnd-inspector--sheet):has(.lesson-editor-block-row.has-ai)]:absolute tw:[&:not(.dnd-inspector--sheet):has(.lesson-editor-block-row.has-ai)]:z-[40] tw:[&:not(.dnd-inspector--sheet):has(.lesson-editor-block-row.has-ai)]:inset-[0] tw:[&:not(.dnd-inspector--sheet):has(.lesson-editor-block-row.has-ai)]:w-[auto] tw:[&:has(.lesson-editor-block-row.has-ai)]:[--dnd-ai-w:clamp(320px,_30vw,_460px)] tw:[&:not(.dnd-inspector--sheet):has(.lesson-editor-block-row.has-ai)]:[border-left:0] tw:[&:not(.dnd-inspector--sheet):has(.lesson-editor-block-row.has-ai)]:animate-dnd-ai-focus-in tw:motion-reduce:[&:has(.lesson-editor-block-row.has-ai)]:animate-none tw:[&:not(.dnd-inspector--sheet):has(.lesson-editor-block-row.has-ai)]:[box-shadow:none] tw:min-1000:[&:not(.dnd-inspector--sheet):has(.lesson-editor-block-row.has-ai)]:pl-(--dnd-ai-w) dnd-inspector--${variant}`}
      aria-label={`Инспектор: ${meta.label.toLowerCase()} «${title}»`}
    >
      {variant === "side" ? resizeHandle : null}
      <header className="dnd-inspector-head tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:grid-rows-[auto_auto] tw:gap-x-[8px] tw:p-[14px_14px_10px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&_.dnd-icon-btn]:col-[2] tw:[.page_.dnd-builder_&_.dnd-icon-btn]:row-[1_/_span_2] tw:[.page_.dnd-builder_&_.dnd-icon-btn]:[align-self:start]">
        <div className="dnd-inspector-kicker tw:flex tw:items-center tw:gap-[6px] tw:text-(--dnd-muted) tw:text-[0.74rem] tw:font-[700] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <Icon name={meta.icon} size={16} />
          {meta.label}
        </div>
        <h2
          className="tw:tracking-[-0.016em] tw:col-[1] tw:m-[2px_0_0] tw:font-[750] tw:text-(--dnd-heading) tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:[&&&]:text-[1.05rem] tw:[&&&]:leading-[1.3] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.05rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.3] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:focus:focus-visible:[&&&]:[outline:none]"
          tabIndex={-1}
          ref={headingRef}
          title={title}
        >
          {title}
        </h2>
        <button
          type="button"
          className="dnd-icon-btn tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[36px] tw:h-[36px] tw:flex-[none] tw:rounded-[9px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:col-[2] tw:row-[1_/_span_2] tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:[align-self:start] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)]"
          onClick={closeInspector}
          aria-label="Свернуть инспектор"
          title="Свернуть инспектор"
        >
          <Icon name={variant === "sheet" ? "close" : "panelRight"} />
        </button>
      </header>
      <div
        className="dnd-tabs tw:flex tw:gap-[2px] tw:p-[0_10px] tw:overflow-x-auto tw:[border-bottom:1px_solid_var(--dnd-border)] tw:[scrollbar-width:none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
        role="tablist"
        aria-label="Разделы инспектора"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`dnd-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="dnd-tabpanel"
            tabIndex={tab === item.id ? 0 : -1}
            className={`tw:text-[0.84rem] tw:leading-[1.45] tw:relative tw:flex-[none] tw:min-h-[40px] tw:p-[0_10px] tw:text-(--dnd-muted) tw:font-[650] tw:cursor-pointer tw:[border:0] tw:[background:transparent] tw:[.page_.dnd-builder_.dnd-tabs_&.is-on]:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.84rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_.dnd-tabs_&.is-on]:[&::after]:absolute tw:[.page_.dnd-builder_.dnd-tabs_&.is-on]:[&::after]:left-[8px] tw:[.page_.dnd-builder_.dnd-tabs_&.is-on]:[&::after]:right-[8px] tw:[.page_.dnd-builder_.dnd-tabs_&.is-on]:[&::after]:bottom-[-1px] tw:[.page_.dnd-builder_.dnd-tabs_&.is-on]:[&::after]:h-[2px] tw:[.page_.dnd-builder_.dnd-tabs_&.is-on]:[&::after]:rounded-[2px] tw:[.page_.dnd-builder_.dnd-tabs_&.is-on]:[&::after]:[content:''] tw:[.page_.dnd-builder_.dnd-tabs_&.is-on]:[&::after]:[background:var(--dnd-accent-ink)] ${tab === item.id ? "is-on" : ""}`}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((t) => t.id === tab);
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next =
                  tabs[
                    (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      tabs.length) %
                      tabs.length
                  ];
                setTab(next.id);
                window.requestAnimationFrame(() =>
                  document.getElementById(`dnd-tab-${next.id}`)?.focus(),
                );
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="dnd-inspector-body nowheel tw:flex-[1] tw:min-h-[0] tw:overflow-y-auto tw:p-[16px_14px_24px] tw:[overscroll-behavior:contain] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-inspector:has(.lesson-editor-block-row.has-ai)_&]:px-[clamp(16px,_2vw,_32px)] tw:[.page_.dnd-builder_.dnd-inspector:has(.lesson-editor-block-row.has-ai)_&]:overflow-x-hidden"
        role="tabpanel"
        id="dnd-tabpanel"
        aria-labelledby={`dnd-tab-${tab}`}
      >
        {/* entity выбран по type, поэтому тип сущности известен */}
        {type === "material" ? (
          <MaterialInspector
            key={entity.id}
            material={entity as DndMaterial}
            tab={tab}
          />
        ) : null}
        {type === "lesson" ? (
          <LessonInspector
            key={entity.id}
            lesson={entity as DndLesson}
            tab={tab}
          />
        ) : null}
        {type === "module" ? (
          <ModuleInspector
            key={entity.id}
            module={entity as DndModule}
            tab={tab}
          />
        ) : null}
        {type === "course" ? (
          <CourseInspector course={entity as DndCourse} tab={tab} />
        ) : null}
      </div>
    </aside>
  );
}
