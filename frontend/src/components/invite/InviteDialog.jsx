// Окно приглашения в систему или в организацию. Оформлено как «Пригласить на курс»:
// тот же модальный каркас, тот же ввод нескольких email и карточки выбора ролей.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notify } from "../../stores/toastStore";
import { fetchRoles, inviteToOrganization, inviteToSystem } from "../../utils/api";
import { getErrorMessage } from "../../utils/errors";
import { describeRole } from "../../utils/invitations";
import EmailRowsField from "./EmailRowsField";
import { useEmailRows } from "./useEmailRows";
import "../course/course-invite.css";

const KINDS = {
  system: {
    eyebrow: "Новые пользователи",
    title: "Пригласить в систему",
    hint: "На почту придёт письмо со ссылкой на регистрацию. После регистрации пользователь окажется в этой организации.",
    rolesRequired: false,
    rolesLabel: "Роли в организации (необязательно)",
    newUserHint: "Получит письмо со ссылкой на регистрацию",
    foundUserHint: () => "Уже зарегистрирован — лучше пригласить в организацию",
    send: inviteToSystem,
  },
  organization: {
    eyebrow: "Участники организации",
    title: "Пригласить в организацию",
    hint: "Если у человека ещё нет аккаунта, вместе с приглашением он получит письмо для регистрации.",
    rolesRequired: true,
    rolesLabel: "Роли в организации",
    send: inviteToOrganization,
  },
};

function sendErrorMessage(error, kind) {
  if (error?.status === 403) return "Недостаточно прав, чтобы отправлять приглашения.";
  if (error?.status === 404) return "Организация или роль не найдена.";
  if (error?.status === 409) {
    return kind === "organization"
      ? "Уже состоит в организации."
      : "Уже зарегистрирован.";
  }
  if (error?.status === 422) return "Проверьте email и выбранные роли.";
  return getErrorMessage(error, "Не удалось отправить приглашение.");
}

export default function InviteDialog({
  open,
  kind = "organization",
  onClose,
  organizationId,
  organizationName = "",
}) {
  const config = KINDS[kind] || KINDS.organization;
  const titleId = useId();
  const emailId = useId();
  const emailRef = useRef(null);
  const emails = useEmailRows();
  const { draft, rows, reset: resetEmails, sendAll } = emails;
  const [roleIds, setRoleIds] = useState([]);
  const [roleList, setRoleList] = useState({ items: [], loading: false, error: "" });
  const [errors, setErrors] = useState({});
  const [isSending, setIsSending] = useState(false);

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
  }, [open, kind, resetEmails]);

  // Список ролей грузим при каждом открытии: роли могли добавить в организации.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setRoleList({ items: [], loading: true, error: "" });
    fetchRoles()
      .then((items) => {
        if (cancelled) return;
        setRoleList({
          items: items.map(describeRole).filter((role) => role.id),
          loading: false,
          error: "",
        });
      })
      .catch(() => {
        if (cancelled) return;
        setRoleList({ items: [], loading: false, error: "Список ролей сейчас недоступен." });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isSending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSending, onClose, open]);

  if (!open) return null;

  const rolesUnavailable =
    config.rolesRequired && !roleList.loading && !roleList.items.length;

  const send = async () => {
    if (isSending) return;
    const nextErrors = {};
    if (config.rolesRequired && !roleIds.length) {
      nextErrors.roles = "Выберите хотя бы одну роль.";
    }
    if (!organizationId) {
      nextErrors.form = "Не удалось определить текущую организацию. Войдите заново.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setIsSending(true);
    const result = await sendAll(
      (email) => config.send({ email, organizationId, grantedRoles: roleIds }),
      (error) => sendErrorMessage(error, kind),
    );
    setIsSending(false);
    if (!result) {
      emailRef.current?.focus();
      return;
    }
    const { sent, total } = result;
    if (!sent.length) return;

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
      className="course-invite-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSending) onClose();
      }}
    >
      <section
        className="course-invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="course-invite-head">
          <div>
            <span className="course-invite-eyebrow">{config.eyebrow}</span>
            <h2 id={titleId}>{config.title}</h2>
            {organizationName ? <p>{organizationName}</p> : null}
          </div>
          <button
            type="button"
            className="course-invite-close"
            onClick={onClose}
            disabled={isSending}
            aria-label="Закрыть"
            title="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="course-invite-body">
          <p className="course-invite-hint">{config.hint}</p>

          <EmailRowsField
            id={emailId}
            inputRef={emailRef}
            emails={emails}
            disabled={isSending}
            {...(config.newUserHint ? { newUserHint: config.newUserHint } : {})}
            {...(config.foundUserHint ? { foundUserHint: config.foundUserHint } : {})}
          />

          <fieldset className="course-invite-roles invite-roles" disabled={isSending}>
            <legend>{config.rolesLabel}</legend>
            {roleList.items.map((role) => {
              const checked = roleIds.includes(role.id);
              return (
                <label
                  key={role.id}
                  className={`course-invite-role ${checked ? "is-active" : ""}`}
                >
                  <input
                    type="checkbox"
                    value={role.id}
                    checked={checked}
                    onChange={() => {
                      setRoleIds((current) =>
                        checked ? current.filter((id) => id !== role.id) : [...current, role.id],
                      );
                      if (errors.roles) setErrors((current) => ({ ...current, roles: "" }));
                    }}
                  />
                  <strong>{role.label}</strong>
                  {role.hint ? <small>{role.hint}</small> : null}
                </label>
              );
            })}
            {roleList.loading ? (
              <p className="course-invite-hint" role="status">
                Загружаем роли…
              </p>
            ) : null}
            {!roleList.loading && !roleList.items.length ? (
              <p className={config.rolesRequired ? "course-invite-error" : "course-invite-hint"}>
                {roleList.error || "Ролей пока нет."}
                {config.rolesRequired
                  ? " Без роли пригласить в организацию нельзя."
                  : " Можно пригласить без роли."}
              </p>
            ) : null}
            {errors.roles ? (
              <p className="course-invite-error" role="alert">
                {errors.roles}
              </p>
            ) : null}
          </fieldset>

          {errors.form ? (
            <p className="course-invite-error" role="alert">
              {errors.form}
            </p>
          ) : null}
        </div>

        <footer className="course-invite-foot">
          <span className="course-invite-summary" aria-live="polite">
            {rows.length > 1 ? `Адресов: ${rows.length}` : ""}
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={isSending}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-solid"
            // Фокус остаётся в поле: иначе blur добавит строку и кнопка «уедет» из-под курсора.
            onMouseDown={(event) => event.preventDefault()}
            onClick={send}
            disabled={isSending || rolesUnavailable || (!rows.length && !draft.trim())}
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
