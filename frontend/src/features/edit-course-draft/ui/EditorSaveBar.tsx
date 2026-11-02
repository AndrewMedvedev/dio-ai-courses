import { useEffect, useMemo, useState } from "react";
import type { RawApiRecord } from "@/shared/api";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { TextDiff } from "@/shared/ui/text-diff";
import {
  isDerivedDraftField,
  useEditorDraftStore,
  type DraftEdit,
} from "../model/editor-draft-store";

export interface EditorSaveBarProps {
  courseId: string;
  /** Сохраняет правки на backend; true — всё сохранилось. */
  onSave: (edits: DraftEdit[]) => Promise<boolean> | boolean;
  /** Возвращает интерфейс к исходным значениям. */
  onDiscard: (edits: DraftEdit[]) => void;
}

interface BlockChangeRow {
  index: number;
  kind: "added" | "removed" | "changed";
  label: string;
  oldText?: string | null;
  newText?: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  title: "Название",
  description: "Описание",
  summary: "Краткое описание",
  duration: "Длительность",
  learningObjectives: "Цели обучения",
  learning_objectives: "Цели обучения",
  contentBlocks: "Содержимое урока",
  estimatedTimeMinutes: "Длительность, мин",
  order: "Порядок",
};

const KIND_LABELS: Record<string, string> = {
  module: "Модуль",
  lesson: "Урок",
};

function shorten(value: unknown, limit = 140): string {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "пусто";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function pluralBlocks(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "блок";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "блока";
  return "блоков";
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  text: "текст",
  video: "видео",
  image: "изображение",
  program_code: "код",
  mermaid: "диаграмма",
  quiz: "вопросы",
  math: "формула",
  chemical: "формула",
  musical: "ноты",
};

function blockText(block: unknown): string {
  if (!block || typeof block !== "object") return String(block ?? "");
  const record = block as RawApiRecord;
  const parts: unknown[] = [
    record.title,
    record.md_content,
    record.code,
    record.formula,
    record.url,
    record.description,
    record.explanation,
  ];
  if (Array.isArray(record.questions)) {
    record.questions.forEach((question: RawApiRecord | null) => {
      parts.push(question?.question, question?.answer);
    });
  }
  if (record.image_id) parts.push(`[изображение ${record.image_id}]`);
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .map(String)
    .join("\n");
}

function blockLabel(
  block: RawApiRecord | null | undefined,
  index: number,
): string {
  const type = BLOCK_TYPE_LABELS[block?.content_type] || "блок";
  return `Блок ${index + 1} (${type})`;
}

function textValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .join("\n");
  }
  return String(value ?? "");
}

/** Что именно поменялось в блоках урока: изменённые, добавленные и удалённые блоки. */
function ContentBlocksChange({
  before,
  after,
}: {
  before: unknown;
  after: unknown;
}) {
  const next = Array.isArray(after) ? after : [];
  const prev = Array.isArray(before) ? before : null;
  if (!prev) {
    return (
      <div className="app-changes-diff tw:flex tw:flex-wrap tw:items-baseline tw:gap-[6px] tw:wrap-anywhere">
        <ins>
          изменено содержимое ({next.length} {pluralBlocks(next.length)})
        </ins>
      </div>
    );
  }

  const rows: BlockChangeRow[] = [];
  const total = Math.max(prev.length, next.length);
  for (let index = 0; index < total; index += 1) {
    const oldText = index < prev.length ? blockText(prev[index]) : null;
    const newText = index < next.length ? blockText(next[index]) : null;
    if (oldText === newText) continue;
    if (oldText === null) {
      rows.push({
        index,
        kind: "added",
        label: blockLabel(next[index], index),
        newText,
      });
    } else if (newText === null) {
      rows.push({
        index,
        kind: "removed",
        label: blockLabel(prev[index], index),
        oldText,
      });
    } else {
      rows.push({
        index,
        kind: "changed",
        label: blockLabel(next[index], index),
        oldText,
        newText,
      });
    }
  }

  if (!rows.length) {
    return (
      <div className="app-changes-diff tw:flex tw:flex-wrap tw:items-baseline tw:gap-[6px] tw:wrap-anywhere">
        <ins>изменены параметры блоков</ins>
      </div>
    );
  }

  const visible = rows.slice(0, 6);
  return (
    <ul className="app-changes-blocks tw:grid tw:gap-[8px] tw:m-[0] tw:p-[0] tw:[list-style:none]">
      {visible.map((row) => (
        <li
          className="tw:grid tw:gap-[4px] tw:p-[8px_10px] tw:rounded-[0_10px_10px_0] tw:[border-left:3px_solid_rgba(var(--accent-rgb),_0.5)] tw:[background:rgba(var(--accent-rgb),_0.05)]"
          key={`${row.kind}-${row.index}`}
        >
          <strong className="tw:text-[0.84rem]">
            {row.label}
            {row.kind === "added"
              ? " — новый"
              : row.kind === "removed"
                ? " — удалён"
                : ""}
          </strong>
          {row.kind === "changed" ? (
            <TextDiff before={row.oldText} after={row.newText} />
          ) : row.kind === "added" ? (
            <span className="app-text-diff tw:block tw:text-(--muted) tw:leading-[1.55] tw:whitespace-pre-wrap tw:wrap-anywhere">
              <ins className="tw:p-[0_2px] tw:rounded-[4px] tw:text-[#1f6b3f] tw:font-[700] tw:[background:rgba(47,_125,_79,_0.16)] tw:dark:text-[#9be2b3] tw:[text-decoration:none] tw:dark:[background:rgba(127,_209,_155,_0.16)]">
                {shorten(row.newText, 220)}
              </ins>
            </span>
          ) : (
            <span className="app-text-diff tw:block tw:text-(--muted) tw:leading-[1.55] tw:whitespace-pre-wrap tw:wrap-anywhere">
              <del>{shorten(row.oldText, 220)}</del>
            </span>
          )}
        </li>
      ))}
      {rows.length > visible.length ? (
        <li className="app-changes-more tw:text-(--muted) tw:text-[0.84rem]">
          …и ещё {rows.length - visible.length}{" "}
          {pluralBlocks(rows.length - visible.length)}
        </li>
      ) : null}
    </ul>
  );
}

/** Краткое описание изменений для окна подтверждения. */
export function ChangesSummary({ edits }: { edits: DraftEdit[] }) {
  return (
    <ul className="app-changes-list tw:grid tw:gap-[10px] tw:m-[0] tw:p-[0] tw:[list-style:none]">
      {edits.map((edit) => (
        <li
          key={edit.key}
          className="app-changes-entity tw:grid tw:gap-[8px] tw:p-[12px_14px] tw:rounded-[14px] tw:[border:1px_solid_var(--app-modal-border)] tw:[background:var(--app-modal-row)]"
        >
          <strong className="tw:text-[var(--heading,_var(--text))]">
            {KIND_LABELS[edit.kind] || "Элемент"} «{shorten(edit.label, 80)}»
          </strong>
          <ul className="app-changes-fields tw:grid tw:gap-[6px] tw:m-[0] tw:p-[0] tw:[list-style:none]">
            {Object.keys(edit.changes)
              .filter((field) => !isDerivedDraftField(field))
              .map((field) => (
                <li
                  key={field}
                  className="app-changes-field tw:grid tw:gap-[2px] tw:text-[0.88rem]"
                >
                  <span className="app-changes-label tw:text-(--muted) tw:text-[0.76rem] tw:font-[800] tw:tracking-[0.04em] tw:uppercase">
                    {FIELD_LABELS[field] || field}
                  </span>
                  {field === "contentBlocks" ? (
                    <ContentBlocksChange
                      before={edit.original[field]}
                      after={edit.changes[field]}
                    />
                  ) : (
                    <TextDiff
                      before={textValue(edit.original[field])}
                      after={textValue(edit.changes[field])}
                    />
                  )}
                </li>
              ))}
          </ul>
          {edit.error ? (
            <p
              className="app-modal-error tw:m-[0] tw:p-[10px_12px] tw:rounded-[12px] tw:text-(--app-modal-danger) tw:font-[700] tw:[background:rgba(180,_35,_24,_0.1)]"
              role="alert"
            >
              {edit.error}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Плашка «Есть несохранённые изменения» внизу редактора курса.
 * onSave(edits) сохраняет на backend и возвращает true, если всё сохранилось.
 * onDiscard(edits) возвращает интерфейс к исходным значениям.
 */
export function EditorSaveBar({
  courseId,
  onSave,
  onDiscard,
}: EditorSaveBarProps) {
  const allEdits = useEditorDraftStore((state) => state.edits);
  const edits = useMemo(
    () => Object.values(allEdits).filter((edit) => edit.courseId === courseId),
    [allEdits, courseId],
  );
  const [dialog, setDialog] = useState<"save" | "discard" | null>(null);

  useEffect(() => {
    if (!edits.length) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [edits.length]);

  useEffect(() => {
    if (!edits.length) setDialog(null);
  }, [edits.length]);

  if (!edits.length && !dialog) return null;

  const count = edits.length;
  const label =
    count === 1
      ? "Есть несохранённые изменения"
      : `Несохранённые изменения: ${count}`;

  return (
    <>
      {count > 0 && (
        <div
          className="editor-save-bar tw:fixed tw:z-[900] tw:left-[50%] tw:bottom-[20px] tw:flex tw:flex-wrap tw:items-center tw:gap-[12px] tw:max-w-[calc(100%_-_32px)] tw:p-[10px_12px_10px_18px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.45)] tw:rounded-[999px] tw:text-(--text) tw:[border-width:1px] tw:dark:border-[rgba(233,_222,_203,_0.24)] tw:max-640:rounded-[18px] tw:[background:var(--glass-bg-strong,_rgba(252,_250,_246,_0.96))] tw:[box-shadow:0_14px_40px_rgba(0,_0,_0,_0.22)] tw:[transform:translateX(-50%)] tw:max-640:justify-center tw:dark:[background:rgba(40,_40,_40,_0.96)] tw:[&_.btn]:p-[6px_16px] tw:[&_.btn]:min-h-[38px]"
          role="status"
        >
          <strong className="tw:text-[0.92rem]">{label}</strong>
          <button
            type="button"
            className="btn btn-outline tw:min-h-[38px] tw:p-[6px_16px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
            onClick={() => setDialog("discard")}
          >
            Отменить изменения
          </button>
          <button
            type="button"
            className="btn btn-solid tw:min-h-[38px] tw:p-[6px_16px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
            onClick={() => setDialog("save")}
          >
            Сохранить
          </button>
        </div>
      )}

      <ConfirmDialog
        open={dialog === "save"}
        title="Сохранить изменения?"
        description="Проверьте, что будет изменено. Данные уйдут на сервер только после подтверждения."
        confirmLabel="Подтвердить"
        cancelLabel="Отмена"
        busyLabel="Сохраняем..."
        size="md"
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          const saved = await onSave(edits);
          if (saved) setDialog(null);
          return saved;
        }}
      >
        <ChangesSummary edits={edits} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "discard"}
        title="Отменить несохранённые изменения?"
        description="Поля модулей и уроков вернутся к последней сохранённой версии. Это действие нельзя отменить."
        confirmLabel="Отменить изменения"
        cancelLabel="Продолжить редактирование"
        busyLabel="Отменяем..."
        danger
        size="md"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          onDiscard(edits);
          setDialog(null);
        }}
      >
        <ChangesSummary edits={edits} />
      </ConfirmDialog>
    </>
  );
}
