// Окно «Пригласить на курс»: email-ы, роль участника и список текущих участников.
// Пользователь проверяется точечным запросом по email (уникальный индекс) только когда
// email введён целиком — без поиска на каждую букву.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchCourseInvitationsPage,
  fetchCourseMembersPage,
  fetchUserById,
  findUserByEmail,
  inviteToCourse,
  revokeCourseInvitation,
} from "../../utils/api";
import { getErrorMessage } from "../../utils/errors";
import "./course-invite.css";

export const COURSE_ROLES = [
  {
    id: "student",
    label: "Студент",
    hint: "Проходит курс: теория, практика, ИИ-ментор.",
  },
  {
    id: "moderator",
    label: "Модератор",
    hint: "Помогает вести курс, может приглашать студентов и модераторов.",
  },
  {
    id: "teacher",
    label: "Преподаватель",
    hint: "Редактирует курс и может приглашать участников с любой ролью.",
  },
];

export const COURSE_ROLE_LABEL = Object.fromEntries(
  COURSE_ROLES.map((role) => [role.id, role.label]),
);

const EMPTY_LIST = {
  items: [],
  page: 0,
  total: 0,
  hasNext: false,
  loading: false,
  error: "",
  forbidden: false,
};

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS = 20;
const MEMBERS_PAGE_SIZE = 20;

const fullNameOf = (user) => user?.full_name || user?.fullName || "";
const memberUserId = (member) => member?.user_id || member?.userId || "";

function userTitle(user) {
  if (!user) return "";
  const name = fullNameOf(user);
  const username = user.username ? `@${user.username}` : "";
  return [name, username].filter(Boolean).join(" · ");
}

function inviteErrorMessage(error, roleLabel) {
  if (error?.status === 403) {
    return `Недостаточно прав, чтобы приглашать с ролью «${roleLabel}».`;
  }
  if (error?.status === 404) return "Курс не найден.";
  if (error?.status === 422) return "Проверьте email.";
  return getErrorMessage(error, "Не удалось отправить приглашение.");
}

export default function CourseInviteDialog({
  open,
  onClose,
  courseId,
  courseTitle,
  canViewMembers = false,
  currentUserId = "",
}) {
  const titleId = useId();
  const inputId = useId();
  const inputRef = useRef(null);
  const lookupCache = useRef(new Map());
  const userCache = useRef(new Map());
  const [tab, setTab] = useState("invite");
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [rows, setRows] = useState([]);
  const [role, setRole] = useState("student");
  const [isSending, setIsSending] = useState(false);
  const [members, setMembers] = useState({
    items: [],
    page: 0,
    total: 0,
    hasNext: false,
    loading: false,
    error: "",
  });
  const [pending, setPending] = useState(EMPTY_LIST);
  const [confirmRevokeId, setConfirmRevokeId] = useState("");
  const [revokingId, setRevokingId] = useState("");
  const [revokeError, setRevokeError] = useState("");
  const [, forceUsersRender] = useState(0);

  const updateRow = useCallback((email, patch, onlyIfStatus = null) => {
    setRows((current) =>
      current.map((row) =>
        row.email === email && (!onlyIfStatus || row.status === onlyIfStatus)
          ? { ...row, ...patch }
          : row,
      ),
    );
  }, []);

  const checkEmail = useCallback(
    async (email) => {
      if (lookupCache.current.has(email)) {
        const user = lookupCache.current.get(email);
        updateRow(email, { status: user ? "found" : "new", user }, "checking");
        return;
      }
      try {
        const user = await findUserByEmail(email);
        lookupCache.current.set(email, user);
        updateRow(email, { status: user ? "found" : "new", user }, "checking");
      } catch {
        // Проверка — только подсказка: приглашение всё равно можно отправить.
        updateRow(email, { status: "unknown", user: null }, "checking");
      }
    },
    [updateRow],
  );

  const addEmails = useCallback(
    (raw) => {
      const parts = String(raw || "")
        .split(/[\s,;]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
      if (!parts.length) return [];

      const invalid = parts.filter((part) => !EMAIL_RE.test(part));
      const valid = parts.filter((part) => EMAIL_RE.test(part));
      const existing = new Set(rows.map((row) => row.email));
      const fresh = [...new Set(valid)].filter((email) => !existing.has(email));
      const room = Math.max(0, MAX_EMAILS - rows.length);
      const accepted = fresh.slice(0, room);

      if (accepted.length) {
        setRows((current) => [
          ...current,
          ...accepted.map((email) => ({
            email,
            status: "checking",
            user: null,
            message: "",
          })),
        ]);
        accepted.forEach(checkEmail);
      }

      if (invalid.length) {
        setDraftError(`Некорректный email: ${invalid.join(", ")}`);
        setDraft(invalid.join(", "));
        return false;
      }
      if (fresh.length > room) {
        setDraftError(`За один раз можно пригласить до ${MAX_EMAILS} человек.`);
      } else {
        setDraftError("");
      }
      setDraft("");
      return accepted;
    },
    [checkEmail, rows],
  );

  const removeRow = (email) => {
    setRows((current) => current.filter((row) => row.email !== email));
  };

  const loadMembers = useCallback(
    async (page) => {
      setMembers((current) => ({ ...current, loading: true, error: "" }));
      try {
        const result = await fetchCourseMembersPage(courseId, {
          page,
          size: MEMBERS_PAGE_SIZE,
        });
        setMembers((current) => ({
          items: page === 1 ? result.items : [...current.items, ...result.items],
          page: result.page,
          total: result.total,
          hasNext: result.hasNext,
          loading: false,
          error: "",
        }));
        // Имена подтягиваем только для текущей страницы и кэшируем: не больше
        // MEMBERS_PAGE_SIZE точечных запросов по первичному ключу.
        const missing = [
          ...new Set(result.items.map(memberUserId)),
        ].filter((id) => id && !userCache.current.has(id));
        missing.forEach((id) => userCache.current.set(id, null));
        await Promise.all(
          missing.map((id) =>
            fetchUserById(id)
              .then((user) => userCache.current.set(id, user))
              .catch(() => userCache.current.set(id, false)),
          ),
        );
        if (missing.length) forceUsersRender((value) => value + 1);
      } catch (error) {
        setMembers((current) => ({
          ...current,
          loading: false,
          error: getErrorMessage(error, "Не удалось загрузить участников."),
        }));
      }
    },
    [courseId],
  );

  const loadPending = useCallback(
    async (page) => {
      setPending((current) => ({ ...current, loading: true, error: "" }));
      try {
        const result = await fetchCourseInvitationsPage(courseId, {
          page,
          size: MEMBERS_PAGE_SIZE,
        });
        setPending((current) => ({
          items: page === 1 ? result.items : [...current.items, ...result.items],
          page: result.page,
          total: result.total,
          hasNext: result.hasNext,
          loading: false,
          error: "",
          forbidden: false,
        }));
      } catch (error) {
        setPending({
          ...EMPTY_LIST,
          page: page || 1,
          // 403 — у пользователя нет прав видеть приглашения: просто не показываем блок
          forbidden: error?.status === 403,
          error:
            error?.status === 403
              ? ""
              : getErrorMessage(error, "Не удалось загрузить приглашения."),
        });
      }
    },
    [courseId],
  );

  // Отзыв в два клика: первый — «Отозвать?», второй — запрос.
  const revoke = async (invitationId, onRevoked) => {
    if (!invitationId || revokingId) return;
    if (confirmRevokeId !== invitationId) {
      setConfirmRevokeId(invitationId);
      setRevokeError("");
      return;
    }
    setRevokingId(invitationId);
    try {
      await revokeCourseInvitation(invitationId);
      onRevoked?.();
      setPending((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== invitationId),
        total: Math.max(0, current.total - 1),
      }));
    } catch (error) {
      setRevokeError(
        error?.status === 409
          ? "Приглашение уже принято — отозвать его нельзя."
          : error?.status === 403
            ? "Недостаточно прав, чтобы отозвать это приглашение."
            : getErrorMessage(error, "Не удалось отозвать приглашение."),
      );
    } finally {
      setRevokingId("");
      setConfirmRevokeId("");
    }
  };

  useEffect(() => {
    if (!confirmRevokeId) return undefined;
    const timer = window.setTimeout(() => setConfirmRevokeId(""), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmRevokeId]);

  useEffect(() => {
    if (!open) return undefined;
    setTab("invite");
    setPending(EMPTY_LIST);
    setConfirmRevokeId("");
    setRevokeError("");
    setRows([]);
    setDraft("");
    setDraftError("");
    setRole("student");
    setMembers({
      items: [],
      page: 0,
      total: 0,
      hasNext: false,
      loading: false,
      error: "",
    });
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, courseId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isSending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSending, onClose, open]);

  useEffect(() => {
    if (open && tab === "members" && canViewMembers && members.page === 0) {
      loadMembers(1);
    }
  }, [canViewMembers, loadMembers, members.page, open, tab]);

  useEffect(() => {
    if (open && tab === "members" && canViewMembers && pending.page === 0) {
      loadPending(1);
    }
  }, [canViewMembers, loadPending, open, pending.page, tab]);

  const pendingRows = rows.filter(
    (row) => row.status !== "sent" && row.status !== "revoked",
  );
  const sentCount = rows.filter((row) => row.status === "sent").length;
  const roleLabel = COURSE_ROLE_LABEL[role];

  const send = async () => {
    if (isSending) return;
    let added = [];
    if (draft.trim()) {
      const result = addEmails(draft);
      if (result === false) return;
      added = result;
    }
    const targets = [...pendingRows.map((row) => row.email), ...added];
    if (!targets.length) {
      setDraftError("Добавьте хотя бы один email.");
      inputRef.current?.focus();
      return;
    }
    setIsSending(true);
    for (const email of targets) {
      updateRow(email, { status: "sending", message: "" });
      try {
        const created = await inviteToCourse({ courseId, email, role });
        updateRow(email, {
          status: "sent",
          invitationId: created?.id || "",
          message: `Приглашение отправлено · ${roleLabel}`,
        });
      } catch (error) {
        updateRow(email, {
          status: "error",
          message: inviteErrorMessage(error, roleLabel),
        });
      }
    }
    setIsSending(false);
    if (members.page > 0) setMembers((current) => ({ ...current, page: 0 }));
    setPending((current) => (current.page > 0 ? { ...current, page: 0 } : current));
  };

  const memberRows = members.items.map((member) => {
        const userId = memberUserId(member);
        const user = userCache.current.get(userId);
        return {
          ...member,
          title:
            user === null || user === undefined
              ? "Загружаем…"
              : user === false
                ? "Пользователь"
                : fullNameOf(user) || user.username || user.email,
          subtitle: user ? user.email : "",
          isMe: Boolean(currentUserId && userId === currentUserId),
        };
      });

  if (!open) return null;

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
            <span className="course-invite-eyebrow">Участники курса</span>
            <h2 id={titleId}>Пригласить на курс</h2>
            {courseTitle ? <p>{courseTitle}</p> : null}
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

        {canViewMembers ? (
          <div className="course-invite-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "invite"}
              className={tab === "invite" ? "is-active" : ""}
              onClick={() => setTab("invite")}
            >
              Пригласить
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "members"}
              className={tab === "members" ? "is-active" : ""}
              onClick={() => setTab("members")}
            >
              Участники{members.total ? ` · ${members.total}` : ""}
            </button>
          </div>
        ) : null}

        {tab === "invite" ? (
          <div className="course-invite-body">
            <div className="course-invite-field">
              <label htmlFor={inputId}>Email</label>
              <div className={`course-invite-input ${draftError ? "has-error" : ""}`}>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="name@example.com"
                  value={draft}
                  disabled={isSending}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (draftError) setDraftError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "," || event.key === ";") {
                      event.preventDefault();
                      addEmails(draft);
                    } else if (event.key === "Backspace" && !draft && rows.length && !isSending) {
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
                  aria-describedby={`${inputId}-hint`}
                  aria-invalid={Boolean(draftError)}
                />
                <button
                  type="button"
                  className="course-invite-add"
                  onClick={() => addEmails(draft)}
                  disabled={!draft.trim() || isSending}
                >
                  Добавить
                </button>
              </div>
              <small
                id={`${inputId}-hint`}
                className={draftError ? "course-invite-error" : "course-invite-hint"}
                role={draftError ? "alert" : undefined}
              >
                {draftError ||
                  "Enter или запятая — добавить. Можно вставить сразу несколько адресов."}
              </small>
            </div>

            {rows.length ? (
              <ul className="course-invite-list" aria-live="polite">
                {rows.map((row) => (
                  <li key={row.email} className={`course-invite-row is-${row.status}`}>
                    <span className="course-invite-avatar" aria-hidden="true">
                      {(fullNameOf(row.user) || row.email).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="course-invite-who">
                      <strong>{row.email}</strong>
                      <small>
                        {row.status === "checking"
                          ? "Проверяем…"
                          : row.status === "found"
                            ? userTitle(row.user) || "Есть в системе"
                            : row.status === "new"
                              ? "Нет в системе — получит ещё и приглашение на регистрацию"
                              : row.status === "unknown"
                                ? "Не удалось проверить — приглашение всё равно можно отправить"
                                : row.status === "sending"
                                  ? "Отправляем…"
                                  : row.message}
                      </small>
                    </span>
                    {row.status === "sent" ? (
                      <span className="course-invite-actions">
                        <span className="course-invite-badge is-ok">Отправлено</span>
                        {row.invitationId ? (
                          <button
                            type="button"
                            className={`course-invite-revoke ${confirmRevokeId === row.invitationId ? "is-confirm" : ""}`}
                            onClick={() =>
                              revoke(row.invitationId, () =>
                                updateRow(row.email, {
                                  status: "revoked",
                                  message: "Приглашение отозвано",
                                }),
                              )
                            }
                            disabled={Boolean(revokingId) || isSending}
                          >
                            {revokingId === row.invitationId
                              ? "Отзываем…"
                              : confirmRevokeId === row.invitationId
                                ? "Точно отозвать?"
                                : "Отозвать"}
                          </button>
                        ) : null}
                      </span>
                    ) : row.status === "revoked" ? (
                      <span className="course-invite-badge">Отозвано</span>
                    ) : (
                      <button
                        type="button"
                        className="course-invite-remove"
                        onClick={() => removeRow(row.email)}
                        disabled={isSending}
                        aria-label={`Убрать ${row.email}`}
                        title="Убрать"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            <fieldset className="course-invite-roles" disabled={isSending}>
              <legend>Роль в курсе</legend>
              {COURSE_ROLES.map((item) => (
                <label
                  key={item.id}
                  className={`course-invite-role ${role === item.id ? "is-active" : ""}`}
                >
                  <input
                    type="radio"
                    name={`${titleId}-role`}
                    value={item.id}
                    checked={role === item.id}
                    onChange={() => setRole(item.id)}
                  />
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </label>
              ))}
            </fieldset>
          </div>
        ) : (
          <div className="course-invite-body">
            {revokeError ? (
              <p className="course-invite-error" role="alert">
                {revokeError}
              </p>
            ) : null}
            {!pending.forbidden && (pending.items.length || pending.loading || pending.error) ? (
              <section className="course-invite-section" aria-label="Ожидают ответа">
                <h3 className="course-invite-subtitle">
                  Ожидают ответа{pending.total ? ` · ${pending.total}` : ""}
                </h3>
                {pending.error ? (
                  <p className="course-invite-error" role="alert">
                    {pending.error}
                  </p>
                ) : null}
                {pending.items.length ? (
                  <ul className="course-invite-list">
                    {pending.items.map((item) => (
                      <li key={item.id} className="course-invite-row is-pending">
                        <span className="course-invite-avatar" aria-hidden="true">
                          {String(item.email || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <span className="course-invite-who">
                          <strong>{item.email}</strong>
                          <small>
                            {COURSE_ROLE_LABEL[item.role] || item.role}
                            {item.created_at ? ` · отправлено ${formatDate(item.created_at)}` : ""}
                            {item.expires_at ? ` · действует до ${formatDate(item.expires_at)}` : ""}
                          </small>
                        </span>
                        <button
                          type="button"
                          className={`course-invite-revoke ${confirmRevokeId === item.id ? "is-confirm" : ""}`}
                          onClick={() => revoke(item.id)}
                          disabled={Boolean(revokingId)}
                        >
                          {revokingId === item.id
                            ? "Отзываем…"
                            : confirmRevokeId === item.id
                              ? "Точно отозвать?"
                              : "Отозвать"}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {pending.loading ? (
                  <p className="course-invite-hint" role="status">
                    Загружаем приглашения…
                  </p>
                ) : null}
                {pending.hasNext && !pending.loading ? (
                  <button
                    type="button"
                    className="btn btn-outline course-invite-more"
                    onClick={() => loadPending(pending.page + 1)}
                  >
                    Показать ещё
                  </button>
                ) : null}
              </section>
            ) : null}
            <h3 className="course-invite-subtitle">
              Участники{members.total ? ` · ${members.total}` : ""}
            </h3>
            {members.error ? (
              <p className="course-invite-error" role="alert">
                {members.error}
              </p>
            ) : null}
            {memberRows.length ? (
              <ul className="course-invite-list">
                {memberRows.map((member) => (
                  <li key={member.id || memberUserId(member)} className="course-invite-row">
                    <span className="course-invite-avatar" aria-hidden="true">
                      {String(member.title).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="course-invite-who">
                      <strong>
                        {member.title}
                        {member.isMe ? " (вы)" : ""}
                      </strong>
                      {member.subtitle ? <small>{member.subtitle}</small> : null}
                    </span>
                    <span className={`course-invite-badge is-${member.role}`}>
                      {COURSE_ROLE_LABEL[member.role] || member.role}
                    </span>
                  </li>
                ))}
              </ul>
            ) : !members.loading && !members.error ? (
              <p className="course-invite-hint">
                В курсе пока нет участников. Пригласите первых на вкладке «Пригласить».
              </p>
            ) : null}
            {members.loading ? (
              <p className="course-invite-hint" role="status">
                Загружаем участников…
              </p>
            ) : null}
            {members.hasNext && !members.loading ? (
              <button
                type="button"
                className="btn btn-outline course-invite-more"
                onClick={() => loadMembers(members.page + 1)}
              >
                Показать ещё
              </button>
            ) : null}
          </div>
        )}

        {tab === "invite" ? (
          <footer className="course-invite-foot">
            <span className="course-invite-summary" aria-live="polite">
              {sentCount ? `Отправлено: ${sentCount}` : ""}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={isSending}
            >
              {sentCount && !pendingRows.length ? "Готово" : "Отмена"}
            </button>
            <button
              type="button"
              className="btn btn-solid"
              onClick={send}
              disabled={isSending || (!pendingRows.length && !draft.trim())}
            >
              {isSending
                ? "Отправляем…"
                : pendingRows.length > 1
                  ? `Пригласить (${pendingRows.length})`
                  : "Пригласить"}
            </button>
          </footer>
        ) : null}
      </section>
    </div>,
    host,
  );
}
