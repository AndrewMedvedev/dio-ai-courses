// Поле «Email» с несколькими адресами и список добавленных адресов со статусами.
import type { RefObject } from "react";
import type { User } from "@/entities/user";
import type { EmailRow, EmailRows } from "../model/use-email-rows";

export interface EmailRowsFieldProps {
  id: string;
  inputRef?: RefObject<HTMLInputElement>;
  emails: EmailRows;
  disabled?: boolean;
  newUserHint?: string;
  foundUserHint?: (user: User | null) => string;
}

const fullNameOf = (user: User | null | undefined) =>
  String(user?.full_name || user?.fullName || "");

function userTitle(user: User | null): string {
  if (!user) return "";
  const name = fullNameOf(user);
  const username = user.username ? `@${user.username}` : "";
  return [name, username].filter(Boolean).join(" · ");
}

export function EmailRowsField({
  id,
  inputRef,
  emails,
  disabled = false,
  newUserHint = "Нет в системе — получит ещё и приглашение на регистрацию",
  foundUserHint = (user) => userTitle(user) || "Есть в системе",
}: EmailRowsFieldProps) {
  const { draft, setDraft, draftError, setDraftError, rows, addEmails, removeRow } = emails;

  const rowText = (row: EmailRow) => {
    if (row.status === "checking") return "Проверяем…";
    if (row.status === "found") return foundUserHint(row.user);
    if (row.status === "new") return newUserHint;
    if (row.status === "unknown") {
      return "Не удалось проверить — приглашение всё равно можно отправить";
    }
    if (row.status === "sending") return "Отправляем…";
    return row.message;
  };

  return (
    <>
      <div className="course-invite-field tw:grid tw:gap-[8px]">
        <label className="tw:p-[0] tw:text-(--text) tw:text-[1rem] tw:font-[800]" htmlFor={id}>Email</label>
        <div className={`course-invite-input tw:flex tw:items-center tw:gap-[8px] tw:p-[7px_7px_7px_20px] tw:border-solid tw:border-(--invite-border) tw:rounded-[999px] tw:[border-width:1px] tw:focus-within:border-[rgba(var(--accent-rgb),_0.85)] tw:[&.has-error]:border-[#c7524a] tw:[background:var(--invite-row)] tw:[transition:border-color_0.15s_ease] tw:focus-within:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.18)] ${draftError ? "has-error" : ""}`}>
          <input className="tw:flex-[1] tw:min-w-[0] tw:text-(--text) tw:[border:0] tw:[outline:0] tw:[background:transparent] tw:[font:inherit] tw:[&&]:text-[1.08rem]"
            ref={inputRef}
            id={id}
            type="text"
            inputMode="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={draft}
            disabled={disabled}
            onChange={(event) => {
              setDraft(event.target.value);
              if (draftError) setDraftError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "," || event.key === ";") {
                event.preventDefault();
                addEmails(draft);
              } else if (event.key === "Backspace" && !draft && rows.length && !disabled) {
                removeRow(rows[rows.length - 1].email);
              }
            }}
            onBlur={() => draft.trim() && addEmails(draft)}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (/[\s,;]/.test(text.trim())) {
                event.preventDefault();
                addEmails(`${draft} ${text}`);
              }
            }}
            aria-describedby={`${id}-hint`}
            aria-invalid={Boolean(draftError)}
          />
          <button
            type="button"
            className="course-invite-add tw:flex-[none] tw:rounded-[999px] tw:p-[10px_18px] tw:text-(--ink-accent) tw:text-[0.98rem] tw:font-[700] tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.7)] tw:[background:rgba(var(--accent-rgb),_0.16)] tw:disabled:cursor-default tw:disabled:opacity-[0.45]"
            onClick={() => addEmails(draft)}
            disabled={!draft.trim() || disabled}
          >
            Добавить
          </button>
        </div>
        <small
          id={`${id}-hint`}
          className={`tw:[&.course-invite-hint]:m-[0] tw:[&.course-invite-hint]:text-[0.92rem] tw:[&.course-invite-hint]:leading-[1.5] tw:[&.course-invite-hint]:text-(--muted) tw:dark:[.page_&.course-invite-error]:text-[#f0978f] tw:[&.course-invite-error]:[&.course-invite-hint]:text-[#b8443c] ${draftError ? "course-invite-error" : "course-invite-hint"}`}
          role={draftError ? "alert" : undefined}
        >
          {draftError ||
            "Enter или запятая — добавить. Можно вставить сразу несколько адресов."}
        </small>
      </div>

      {rows.length ? (
        <ul className="course-invite-list tw:grid tw:gap-[10px] tw:m-[0] tw:p-[0] tw:[list-style:none]" aria-live="polite">
          {rows.map((row) => (
            <li key={row.email} className={`course-invite-row tw:grid tw:grid-cols-[42px_minmax(0,_1fr)_auto] tw:items-center tw:gap-[14px] tw:p-[12px_14px] tw:border-solid tw:border-(--invite-border) tw:rounded-[16px] tw:[border-width:1px] tw:[&.is-error]:border-[rgba(199,_82,_74,_0.55)] tw:[&.is-sent]:border-[rgba(76,_150,_104,_0.45)] tw:[background:var(--invite-row)] tw:[&.is-revoked]:opacity-[0.65] is-${row.status}`}>
              <span className="course-invite-avatar tw:grid tw:w-[42px] tw:h-[42px] tw:rounded-[999px] tw:text-[1.05rem] tw:text-(--ink-accent) tw:font-[800] tw:[place-items:center] tw:[background:rgba(var(--accent-rgb),_0.24)]" aria-hidden="true">
                {(fullNameOf(row.user) || row.email).slice(0, 1).toUpperCase()}
              </span>
              <span className="course-invite-who tw:grid tw:gap-[2px] tw:min-w-[0]">
                <strong className="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[1.05rem]">{row.email}</strong>
                <small className="tw:text-[0.9rem] tw:leading-[1.4] tw:[.course-invite-row.is-found_.course-invite-who_&]:text-(--ink-accent)">{rowText(row)}</small>
              </span>
              <button
                type="button"
                className="course-invite-remove tw:flex-[none] tw:grid tw:w-[34px] tw:h-[34px] tw:border-solid tw:border-(--invite-border) tw:rounded-[999px] tw:text-(--muted) tw:text-[1.25rem] tw:leading-[1] tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:[&:hover:not(:disabled)]:border-[rgba(var(--accent-rgb),_0.7)] tw:[&:hover:not(:disabled)]:text-(--text)"
                onClick={() => removeRow(row.email)}
                disabled={disabled}
                aria-label={`Убрать ${row.email}`}
                title="Убрать"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
