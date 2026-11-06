// Окно приглашения в организацию. Оформлено как «Пригласить на курс»:
// тот же модальный каркас, тот же ввод нескольких email и карточки выбора ролей.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  describeRole,
  fetchInvitationRoles,
  inviteToOrganization,
  type RoleDescription,
} from "@/entities/invitation";
import { getErrorMessage } from "@/shared/lib/errors";
import { notify } from "@/shared/ui/toast";
import { useEmailRows } from "../model/use-email-rows";
import { EmailRowsField } from "./EmailRowsField";

export interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  organizationId?: string | null;
  organizationName?: string;
}

const statusOf = (error: unknown) =>
  (error as { status?: number } | null)?.status;

const CONFIG = {
  eyebrow: "Участники организации",
  title: "Пригласить в организацию",
  hint: "Если у человека ещё нет аккаунта, вместе с приглашением он получит письмо для регистрации.",
  rolesLabel: "Роли в организации",
};

function sendErrorMessage(error: unknown): string {
  if (statusOf(error) === 403)
    return "Недостаточно прав, чтобы отправлять приглашения.";
  if (statusOf(error) === 404) return "Организация или роль не найдена.";
  if (statusOf(error) === 409) return "Уже состоит в организации.";
  if (statusOf(error) === 422) return "Проверьте email и выбранные роли.";
  return getErrorMessage(error, "Не удалось отправить приглашение.") ?? "";
}

export function InviteDialog({
  open,
  onClose,
  onSent,
  organizationId,
  organizationName = "",
}: InviteDialogProps) {
  const config = CONFIG;
  const titleId = useId();
  const emailId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const emails = useEmailRows();
  const { draft, rows, reset: resetEmails, sendAll } = emails;
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ roles?: string; form?: string }>({});
  const [isSending, setIsSending] = useState(false);
  const [roles, setRoles] = useState<RoleDescription[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState("");
  const [rolesAttempt, setRolesAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setRoles([]);
    setRoleIds([]);
    setRolesError("");
    setRolesLoading(true);
    fetchInvitationRoles()
      .then((items) => {
        if (!active) return;
        setRoles(items.map(describeRole));
        if (!items.length)
          setRolesError("Нет доступных ролей для приглашения.");
      })
      .catch((error) => {
        if (active)
          setRolesError(
            statusOf(error) === 403
              ? "Нет доступа к списку ролей. Обратитесь к администратору."
              : "Не удалось загрузить роли. Повторите попытку.",
          );
      })
      .finally(() => {
        if (active) setRolesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, rolesAttempt]);

  // Каждое открытие — чистая форма.
  useEffect(() => {
    if (!open) return undefined;
    resetEmails();
    setRoleIds([]);
    setErrors({});
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => emailRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, resetEmails]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSending, onClose, open]);

  if (!open) return null;

  const send = async () => {
    if (isSending || rolesLoading || rolesError) return;
    const nextErrors: { roles?: string; form?: string } = {};
    if (!roleIds.length) {
      nextErrors.roles = "Выберите хотя бы одну роль.";
    }
    if (!organizationId) {
      nextErrors.form =
        "Не удалось определить текущую организацию. Войдите заново.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setIsSending(true);
    const result = await sendAll(
      (email) => inviteToOrganization({ email, grantedRoles: roleIds }),
      (error) => sendErrorMessage(error),
    );
    setIsSending(false);
    if (!result) {
      emailRef.current?.focus();
      return;
    }
    const { sent, total } = result;
    if (!sent.length) return;
    onSent?.();

    notify(
      sent.length === 1
        ? `Приглашение отправлено на ${sent[0]}`
        : `Отправлено приглашений: ${sent.length}`,
    );
    // Всё ушло — закрываем; иначе в списке остаются только адреса с ошибкой.
    if (sent.length === total) onClose();
  };

  const host = document.querySelector(".page") || document.body;

  return createPortal(
    <div
      className="course-invite-backdrop tw:fixed tw:z-[1000] tw:inset-[0] tw:grid tw:p-[min(10vh,_96px)_16px_24px] tw:overflow-y-auto tw:[--invite-bg:rgba(250,_247,_241,_0.97)] tw:[--invite-row:rgba(255,_255,_255,_0.55)] tw:[--invite-border:rgba(43,_43,_43,_0.12)] tw:[place-items:start_center] tw:max-640:p-[0] tw:[background:rgba(16,_18,_24,_0.55)] tw:[-webkit-backdrop-filter:blur(6px)] tw:[backdrop-filter:blur(6px)] tw:animate-course-invite-fade tw:dark:[--invite-bg:rgba(40,_40,_40,_0.97)] tw:dark:[--invite-row:rgba(233,_222,_203,_0.05)] tw:dark:[--invite-border:rgba(233,_222,_203,_0.16)] tw:max-640:[place-items:end_stretch] tw:dark:[background:rgba(8,_9,_12,_0.66)] tw:motion-reduce:animate-none"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSending) onClose();
      }}
    >
      <section
        className="course-invite-modal tw:w-[min(760px,_100%)] tw:max-h-[calc(100dvh_-_min(10vh,_96px)_-_24px)] tw:flex tw:flex-col tw:rounded-[22px] tw:text-(--text) tw:overflow-hidden tw:max-640:w-[100%] tw:max-640:max-h-[92dvh] tw:[border:1px_solid_var(--glass-border)] tw:max-640:rounded-[22px_22px_0_0] tw:[background:var(--invite-bg)] tw:[box-shadow:0_24px_64px_rgba(0,_0,_0,_0.28),_var(--glass-inset)] tw:animate-course-invite-pop tw:motion-reduce:animate-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="course-invite-head tw:flex tw:items-start tw:justify-between tw:gap-[16px] tw:p-[28px_32px_16px] tw:max-640:px-[16px]">
          <div>
            <span className="course-invite-eyebrow tw:block tw:mb-[6px] tw:text-(--eyebrow) tw:text-[0.8rem] tw:font-[800] tw:tracking-[0.1em] tw:uppercase">
              {config.eyebrow}
            </span>
            <h2
              className="tw:text-[var(--heading,_var(--text))] tw:text-[1.85rem] tw:leading-[1.2] tw:max-640:text-[1.5rem]"
              id={titleId}
            >
              {config.title}
            </h2>
            {organizationName ? (
              <p className="tw:m-[8px_0_0] tw:text-(--muted) tw:text-[1.02rem] tw:wrap-anywhere">
                {organizationName}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="course-invite-close tw:flex-[none] tw:grid tw:w-[42px] tw:h-[42px] tw:border-solid tw:border-(--invite-border) tw:rounded-[999px] tw:text-(--muted) tw:text-[1.5rem] tw:leading-[1] tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:[&:hover:not(:disabled)]:border-[rgba(var(--accent-rgb),_0.7)] tw:[&:hover:not(:disabled)]:text-(--text)"
            onClick={onClose}
            disabled={isSending}
            aria-label="Закрыть"
            title="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="course-invite-body tw:grid tw:gap-[22px] tw:p-[22px_32px] tw:overflow-y-auto tw:max-640:px-[16px] tw:[overscroll-behavior:contain]">
          <p className="course-invite-hint tw:m-[0] tw:text-[0.92rem] tw:leading-[1.5] tw:text-(--muted)">
            {config.hint}
          </p>

          <EmailRowsField
            id={emailId}
            inputRef={emailRef}
            emails={emails}
            disabled={isSending}
          />

          <fieldset
            className="course-invite-roles invite-roles tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[10px] tw:m-[0] tw:p-[0] tw:min-w-[0] tw:max-640:grid-cols-[1fr] tw:[border:0]"
            disabled={isSending}
          >
            <legend className="tw:p-[0] tw:text-(--text) tw:text-[1rem] tw:font-[800] tw:mb-[8px]">
              {config.rolesLabel}
            </legend>
            {rolesLoading && <p role="status">Загружаем роли…</p>}
            {rolesError && (
              <p role="alert">
                {rolesError}{" "}
                <button
                  type="button"
                  className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                  onClick={() => setRolesAttempt((value) => value + 1)}
                >
                  Повторить
                </button>
              </p>
            )}
            {roles.map((role) => {
              const checked = roleIds.includes(role.id as string);
              return (
                <label
                  key={role.id}
                  className={`course-invite-role tw:relative tw:grid tw:gap-[8px] tw:p-[18px] tw:border-solid tw:border-(--invite-border) tw:rounded-[18px] tw:cursor-pointer tw:[align-content:start] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.6)] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.95)] tw:[background:var(--invite-row)] tw:[transition:border-color_0.15s_ease,_background_0.15s_ease] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] tw:[.course-invite-roles:disabled_&]:cursor-default tw:[&.is-active]:[box-shadow:inset_0_0_0_1px_rgba(var(--accent-rgb),_0.6)] tw:[.course-invite-roles:disabled_&]:opacity-[0.7] tw:[&:has(input:focus-visible)]:[outline:2px_solid_rgba(var(--accent-rgb),_0.85)] tw:[&:has(input:focus-visible)]:[outline-offset:2px] ${checked ? "is-active" : ""}`}
                >
                  <input
                    className="tw:absolute tw:opacity-[0] tw:pointer-events-none"
                    type="checkbox"
                    value={role.id}
                    checked={checked}
                    onChange={() => {
                      setRoleIds((current) =>
                        checked
                          ? current.filter((id) => id !== role.id)
                          : [...current, role.id as string],
                      );
                      if (errors.roles)
                        setErrors((current) => ({ ...current, roles: "" }));
                    }}
                  />
                  <strong className="tw:text-[1.08rem]">{role.label}</strong>
                  {role.hint ? (
                    <small className="tw:text-(--muted) tw:text-[0.88rem] tw:leading-[1.45]">
                      {role.hint}
                    </small>
                  ) : null}
                </label>
              );
            })}
            {errors.roles ? (
              <p
                className="course-invite-error tw:m-[0] tw:text-[0.92rem] tw:leading-[1.5] tw:text-[#b8443c] tw:col-[1_/_-1] tw:dark:text-[#f0978f]"
                role="alert"
              >
                {errors.roles}
              </p>
            ) : null}
          </fieldset>

          {errors.form ? (
            <p
              className="course-invite-error tw:m-[0] tw:text-[0.92rem] tw:leading-[1.5] tw:text-[#b8443c] tw:dark:[.page_&]:text-[#f0978f]"
              role="alert"
            >
              {errors.form}
            </p>
          ) : null}
        </div>

        <footer className="course-invite-foot tw:flex tw:items-center tw:justify-end tw:gap-[12px] tw:p-[18px_32px_26px] tw:max-640:px-[16px] tw:[border-top:1px_solid_var(--invite-border)] tw:[&_.btn]:p-[13px_24px] tw:max-640:[&_.btn]:p-[12px_18px] tw:[&_.btn]:text-[1.02rem] tw:[&_.btn:disabled]:opacity-[0.55] tw:[&_.btn:disabled]:cursor-default tw:[&_.btn:disabled]:[transform:none] tw:max-640:[&_.btn]:whitespace-nowrap">
          <span
            className="course-invite-summary tw:mr-[auto] tw:text-(--muted) tw:text-[0.95rem] tw:max-640:hidden"
            aria-live="polite"
          >
            {rows.length > 1 ? `Адресов: ${rows.length}` : ""}
          </span>
          <button
            type="button"
            className="btn btn-outline tw:p-[13px_24px] tw:text-[1.02rem] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:max-640:p-[12px_18px] tw:max-640:whitespace-nowrap tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:disabled:opacity-[0.55] tw:disabled:cursor-default tw:hover:[transform:translateY(-1px)] tw:disabled:[transform:none]"
            onClick={onClose}
            disabled={isSending}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-solid tw:p-[13px_24px] tw:text-[1.02rem] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:max-640:p-[12px_18px] tw:max-640:whitespace-nowrap tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:disabled:opacity-[0.55] tw:disabled:cursor-default tw:hover:[transform:translateY(-1px)] tw:disabled:[transform:none]"
            // Фокус остаётся в поле: иначе blur добавит строку и кнопка «уедет» из-под курсора.
            onMouseDown={(event) => event.preventDefault()}
            onClick={send}
            disabled={
              isSending ||
              rolesLoading ||
              Boolean(rolesError) ||
              (!rows.length && !draft.trim())
            }
          >
            {isSending
              ? "Отправляем…"
              : rows.length > 1
                ? `Пригласить (${rows.length})`
                : "Пригласить"}
          </button>
        </footer>
      </section>
    </div>,
    host,
  );
}
