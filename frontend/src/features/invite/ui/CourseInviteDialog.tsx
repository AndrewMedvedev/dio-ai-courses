// Окно «Пригласить на курс»: email-ы, роль участника и список текущих участников.
// Пользователь проверяется точечным запросом по email (уникальный индекс) только когда
// email введён целиком — без поиска на каждую букву.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  COURSE_ROLES,
  COURSE_ROLE_LABEL,
  fetchCourseMembersPage,
  type CourseMemberRole,
} from "@/entities/course";
import {
  fetchCourseInvitationsPage,
  inviteToCourse,
  revokeCourseInvitation,
} from "@/entities/invitation";
import { fetchUserById, type User } from "@/entities/user";
import type { RawApiRecord } from "@/shared/api";
import { getErrorMessage } from "@/shared/lib/errors";
import { notify } from "@/shared/ui/toast";
import { useEmailRows } from "../model/use-email-rows";
import { EmailRowsField } from "./EmailRowsField";

export interface CourseInviteDialogProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle?: string;
  canViewMembers?: boolean;
  currentUserId?: string;
}

interface ListState {
  items: RawApiRecord[];
  page: number;
  total: number;
  hasNext: boolean;
  loading: boolean;
  error: string;
  forbidden?: boolean;
}

const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;
const errorText = (error: unknown, fallback: string) =>
  getErrorMessage(error, fallback) ?? fallback;

const EMPTY_LIST: ListState = {
  items: [],
  page: 0,
  total: 0,
  hasNext: false,
  loading: false,
  error: "",
  forbidden: false,
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

const MEMBERS_PAGE_SIZE = 20;

const fullNameOf = (user: User | null | undefined) =>
  String(user?.full_name || user?.fullName || "");
const memberUserId = (member: RawApiRecord | null | undefined): string =>
  member?.user_id || member?.userId || "";

function inviteErrorMessage(error: unknown, roleLabel: string): string {
  if (statusOf(error) === 403) {
    return `Недостаточно прав, чтобы приглашать с ролью «${roleLabel}».`;
  }
  if (statusOf(error) === 404) return "Курс не найден.";
  if (statusOf(error) === 409) return "Этот пользователь уже участник курса.";
  if (statusOf(error) === 422) return "Проверьте email.";
  return errorText(error, "Не удалось отправить приглашение.");
}

export function CourseInviteDialog({
  open,
  onClose,
  courseId,
  courseTitle,
  canViewMembers = false,
  currentUserId = "",
}: CourseInviteDialogProps) {
  const titleId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // null — загружается, false — не удалось загрузить.
  const userCache = useRef(new Map<string, User | null | false>());
  const [tab, setTab] = useState<"invite" | "members">("invite");
  const emails = useEmailRows();
  const { draft, rows, reset: resetEmails, sendAll } = emails;
  const [role, setRole] = useState<CourseMemberRole>("student");
  const [isSending, setIsSending] = useState(false);
  const [members, setMembers] = useState<ListState>({
    items: [],
    page: 0,
    total: 0,
    hasNext: false,
    loading: false,
    error: "",
  });
  const [pending, setPending] = useState<ListState>(EMPTY_LIST);
  const [confirmRevokeId, setConfirmRevokeId] = useState("");
  const [revokingId, setRevokingId] = useState("");
  const [revokeError, setRevokeError] = useState("");
  const [, forceUsersRender] = useState(0);

  const loadMembers = useCallback(
    async (page: number) => {
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
          error: errorText(error, "Не удалось загрузить участников."),
        }));
      }
    },
    [courseId],
  );

  const loadPending = useCallback(
    async (page: number) => {
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
          forbidden: statusOf(error) === 403,
          error:
            statusOf(error) === 403
              ? ""
              : errorText(error, "Не удалось загрузить приглашения."),
        });
      }
    },
    [courseId],
  );

  // Отзыв в два клика: первый — «Отозвать?», второй — запрос.
  const revoke = async (invitationId: string, onRevoked?: () => void) => {
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
        statusOf(error) === 409
          ? "Приглашение уже принято — отозвать его нельзя."
          : statusOf(error) === 403
            ? "Недостаточно прав, чтобы отозвать это приглашение."
            : errorText(error, "Не удалось отозвать приглашение."),
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
    resetEmails();
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
    const onKeyDown = (event: KeyboardEvent) => {
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

  const roleLabel = COURSE_ROLE_LABEL[role];

  const send = async () => {
    if (isSending) return;
    setIsSending(true);
    const result = await sendAll(
      (email) => inviteToCourse({ courseId, email, role }),
      (error) => inviteErrorMessage(error, roleLabel),
    );
    setIsSending(false);
    if (!result) {
      inputRef.current?.focus();
      return;
    }
    if (members.page > 0) setMembers((current) => ({ ...current, page: 0 }));
    setPending((current) => (current.page > 0 ? { ...current, page: 0 } : current));
    const { sent, total } = result;
    if (!sent.length) return;

    notify(
      sent.length === 1
        ? `Приглашение отправлено на ${sent[0]} · ${roleLabel}`
        : `Отправлено приглашений: ${sent.length} · ${roleLabel}`,
    );
    // Всё ушло — закрываем окно, форма очистится при следующем открытии.
    // Если часть адресов с ошибкой — в списке остаются только они.
    if (sent.length === total) onClose();
  };

  const memberRows: Array<
    RawApiRecord & { title: string; subtitle?: string; isMe: boolean }
  > = members.items.map((member) => {
        const userId = memberUserId(member);
        const user = userCache.current.get(userId);
        return {
          ...member,
          title:
            user === null || user === undefined
              ? "Загружаем…"
              : user === false
                ? "Пользователь"
                : fullNameOf(user) || user.username || user.email || "",
          subtitle: user ? user.email : "",
          isMe: Boolean(currentUserId && userId === currentUserId),
        };
      });

  if (!open) return null;

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
            <span className="course-invite-eyebrow tw:block tw:mb-[6px] tw:text-(--eyebrow) tw:text-[0.8rem] tw:font-[800] tw:tracking-[0.1em] tw:uppercase">Участники курса</span>
            <h2 className="tw:text-[var(--heading,_var(--text))] tw:text-[1.85rem] tw:leading-[1.2] tw:max-640:text-[1.5rem]" id={titleId}>Пригласить на курс</h2>
            {courseTitle ? <p className="tw:m-[8px_0_0] tw:text-(--muted) tw:text-[1.02rem] tw:wrap-anywhere">{courseTitle}</p> : null}
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

        {canViewMembers ? (
          <div className="course-invite-tabs tw:flex tw:gap-[6px] tw:m-[0_32px] tw:p-[5px] tw:rounded-[999px] tw:w-[max-content] tw:max-640:mx-[16px] tw:[border:1px_solid_var(--invite-border)]" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "invite"}
              className={`tw:rounded-[999px] tw:p-[9px_20px] tw:text-(--muted) tw:text-[1rem] tw:font-[700] tw:cursor-pointer tw:[border:0] tw:[background:transparent] tw:[&.is-active]:text-(--text) tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.22)] ${tab === "invite" ? "is-active" : ""}`}
              onClick={() => setTab("invite")}
            >
              Пригласить
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "members"}
              className={`tw:rounded-[999px] tw:p-[9px_20px] tw:text-(--muted) tw:text-[1rem] tw:font-[700] tw:cursor-pointer tw:[border:0] tw:[background:transparent] tw:[&.is-active]:text-(--text) tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.22)] ${tab === "members" ? "is-active" : ""}`}
              onClick={() => setTab("members")}
            >
              Участники{members.total ? ` · ${members.total}` : ""}
            </button>
          </div>
        ) : null}

        {tab === "invite" ? (
          <div className="course-invite-body tw:grid tw:gap-[22px] tw:p-[22px_32px] tw:overflow-y-auto tw:max-640:px-[16px] tw:[overscroll-behavior:contain]">
            <EmailRowsField
              id={inputId}
              inputRef={inputRef}
              emails={emails}
              disabled={isSending}
            />

            <fieldset className="course-invite-roles tw:grid tw:grid-cols-[repeat(3,_minmax(0,_1fr))] tw:gap-[10px] tw:m-[0] tw:p-[0] tw:min-w-[0] tw:max-640:grid-cols-[1fr] tw:[border:0]" disabled={isSending}>
              <legend className="tw:p-[0] tw:text-(--text) tw:text-[1rem] tw:font-[800] tw:mb-[8px]">Роль в курсе</legend>
              {COURSE_ROLES.map((item) => (
                <label
                  key={item.id}
                  className={`course-invite-role tw:relative tw:grid tw:gap-[8px] tw:p-[18px] tw:border-solid tw:border-(--invite-border) tw:rounded-[18px] tw:cursor-pointer tw:[align-content:start] tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.95)] tw:hover:border-[rgba(var(--accent-rgb),_0.6)] tw:[background:var(--invite-row)] tw:[transition:border-color_0.15s_ease,_background_0.15s_ease] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] tw:[.course-invite-roles:disabled_&]:cursor-default tw:[&.is-active]:[box-shadow:inset_0_0_0_1px_rgba(var(--accent-rgb),_0.6)] tw:[.course-invite-roles:disabled_&]:opacity-[0.7] tw:[&:has(input:focus-visible)]:[outline:2px_solid_rgba(var(--accent-rgb),_0.85)] tw:[&:has(input:focus-visible)]:[outline-offset:2px] ${role === item.id ? "is-active" : ""}`}
                >
                  <input className="tw:absolute tw:opacity-[0] tw:pointer-events-none"
                    type="radio"
                    name={`${titleId}-role`}
                    value={item.id}
                    checked={role === item.id}
                    onChange={() => setRole(item.id)}
                  />
                  <strong className="tw:text-[1.08rem]">{item.label}</strong>
                  <small className="tw:text-(--muted) tw:text-[0.88rem] tw:leading-[1.45]">{item.hint}</small>
                </label>
              ))}
            </fieldset>
          </div>
        ) : (
          <div className="course-invite-body tw:grid tw:gap-[22px] tw:p-[22px_32px] tw:overflow-y-auto tw:max-640:px-[16px] tw:[overscroll-behavior:contain]">
            {revokeError ? (
              <p className="course-invite-error tw:m-[0] tw:text-[0.92rem] tw:leading-[1.5] tw:text-[#b8443c] tw:dark:[.page_&]:text-[#f0978f]" role="alert">
                {revokeError}
              </p>
            ) : null}
            {!pending.forbidden && (pending.items.length || pending.loading || pending.error) ? (
              <section className="course-invite-section tw:grid tw:gap-[10px]" aria-label="Ожидают ответа">
                <h3 className="course-invite-subtitle tw:m-[0] tw:text-(--muted) tw:text-[0.86rem] tw:font-[800] tw:tracking-[0.08em] tw:uppercase">
                  Ожидают ответа{pending.total ? ` · ${pending.total}` : ""}
                </h3>
                {pending.error ? (
                  <p className="course-invite-error tw:m-[0] tw:text-[0.92rem] tw:leading-[1.5] tw:text-[#b8443c] tw:dark:[.page_&]:text-[#f0978f]" role="alert">
                    {pending.error}
                  </p>
                ) : null}
                {pending.items.length ? (
                  <ul className="course-invite-list tw:grid tw:gap-[10px] tw:m-[0] tw:p-[0] tw:[list-style:none]">
                    {pending.items.map((item) => (
                      <li key={item.id} className="course-invite-row is-pending tw:grid tw:grid-cols-[42px_minmax(0,_1fr)_auto] tw:items-center tw:gap-[14px] tw:p-[12px_14px] tw:rounded-[16px] tw:[border:1px_solid_var(--invite-border)] tw:[background:var(--invite-row)]">
                        <span className="course-invite-avatar tw:grid tw:w-[42px] tw:h-[42px] tw:rounded-[999px] tw:text-[1.05rem] tw:text-(--ink-accent) tw:font-[800] tw:[place-items:center] tw:[background:rgba(var(--accent-rgb),_0.24)]" aria-hidden="true">
                          {String(item.email || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <span className="course-invite-who tw:grid tw:gap-[2px] tw:min-w-[0] tw:[.course-invite-row.is-new_&_small]:text-(--info-text) tw:[.course-invite-row.is-error_&_small]:text-[#b8443c] tw:dark:[.page_.course-invite-row.is-error_&_small]:text-[#f0978f] tw:[.course-invite-row.is-pending_&_small]:text-(--muted)">
                          <strong>{item.email}</strong>
                          <small>
                            {COURSE_ROLE_LABEL[item.role] || item.role}
                            {item.created_at ? ` · отправлено ${formatDate(item.created_at)}` : ""}
                            {item.expires_at ? ` · действует до ${formatDate(item.expires_at)}` : ""}
                          </small>
                        </span>
                        <button
                          type="button"
                          className={`course-invite-revoke tw:flex-[none] tw:border-solid tw:border-(--invite-border) tw:rounded-[999px] tw:p-[8px_14px] tw:text-(--muted) tw:text-[0.9rem] tw:font-[700] tw:whitespace-nowrap tw:cursor-pointer tw:[border-width:1px] tw:[&.is-confirm]:border-[rgba(199,_82,_74,_0.75)] tw:[background:transparent] tw:[&.is-confirm]:text-[#b8443c] tw:disabled:cursor-default tw:[transition:color_0.15s_ease,_border-color_0.15s_ease,_background_0.15s_ease] tw:disabled:opacity-[0.5] tw:[&.is-confirm]:[background:rgba(199,_82,_74,_0.12)] tw:dark:[.page_&.is-confirm]:text-[#f0978f] tw:[&:hover:not(:disabled)]:border-[rgba(199,_82,_74,_0.55)] tw:[&:hover:not(:disabled)]:text-(--text) ${confirmRevokeId === item.id ? "is-confirm" : ""}`}
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
                  <p className="course-invite-hint tw:m-[0] tw:text-[0.92rem] tw:leading-[1.5] tw:text-(--muted)" role="status">
                    Загружаем приглашения…
                  </p>
                ) : null}
                {pending.hasNext && !pending.loading ? (
                  <button
                    type="button"
                    className="btn btn-outline course-invite-more tw:justify-self-center tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                    onClick={() => loadPending(pending.page + 1)}
                  >
                    Показать ещё
                  </button>
                ) : null}
              </section>
            ) : null}
            <h3 className="course-invite-subtitle tw:m-[0] tw:text-(--muted) tw:text-[0.86rem] tw:font-[800] tw:tracking-[0.08em] tw:uppercase">
              Участники{members.total ? ` · ${members.total}` : ""}
            </h3>
            {members.error ? (
              <p className="course-invite-error tw:m-[0] tw:text-[0.92rem] tw:leading-[1.5] tw:text-[#b8443c] tw:dark:[.page_&]:text-[#f0978f]" role="alert">
                {members.error}
              </p>
            ) : null}
            {memberRows.length ? (
              <ul className="course-invite-list tw:grid tw:gap-[10px] tw:m-[0] tw:p-[0] tw:[list-style:none]">
                {memberRows.map((member) => (
                  <li key={member.id || memberUserId(member)} className="course-invite-row tw:grid tw:grid-cols-[42px_minmax(0,_1fr)_auto] tw:items-center tw:gap-[14px] tw:p-[12px_14px] tw:rounded-[16px] tw:[border:1px_solid_var(--invite-border)] tw:[background:var(--invite-row)]">
                    <span className="course-invite-avatar tw:grid tw:w-[42px] tw:h-[42px] tw:rounded-[999px] tw:text-[1.05rem] tw:text-(--ink-accent) tw:font-[800] tw:[place-items:center] tw:[background:rgba(var(--accent-rgb),_0.24)]" aria-hidden="true">
                      {String(member.title).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="course-invite-who tw:grid tw:gap-[2px] tw:min-w-[0] tw:[.course-invite-row.is-new_&_small]:text-(--info-text) tw:[.course-invite-row.is-error_&_small]:text-[#b8443c] tw:dark:[.page_.course-invite-row.is-error_&_small]:text-[#f0978f] tw:[.course-invite-row.is-pending_&_small]:text-(--muted)">
                      <strong>
                        {member.title}
                        {member.isMe ? " (вы)" : ""}
                      </strong>
                      {member.subtitle ? <small>{member.subtitle}</small> : null}
                    </span>
                    <span className={`course-invite-badge tw:p-[5px_12px] tw:rounded-[999px] tw:border-solid tw:border-(--invite-border) tw:text-[0.86rem] tw:font-[800] tw:whitespace-nowrap tw:[border-width:1px] tw:[&.is-ok]:border-[rgba(76,_150,_104,_0.5)] tw:[&.is-ok]:text-[#3f8a5b] tw:dark:[.page_&.is-ok]:text-[#8fd1a6] tw:[&.is-teacher]:[background:rgba(var(--accent-rgb),_0.22)] tw:[&.is-moderator]:[background:rgba(var(--accent-soft-rgb),_0.2)] is-${member.role}`}>
                      {COURSE_ROLE_LABEL[member.role] || member.role}
                    </span>
                  </li>
                ))}
              </ul>
            ) : !members.loading && !members.error ? (
              <p className="course-invite-hint tw:m-[0] tw:text-[0.92rem] tw:leading-[1.5] tw:text-(--muted)">
                В курсе пока нет участников. Пригласите первых на вкладке «Пригласить».
              </p>
            ) : null}
            {members.loading ? (
              <p className="course-invite-hint tw:m-[0] tw:text-[0.92rem] tw:leading-[1.5] tw:text-(--muted)" role="status">
                Загружаем участников…
              </p>
            ) : null}
            {members.hasNext && !members.loading ? (
              <button
                type="button"
                className="btn btn-outline course-invite-more tw:justify-self-center tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                onClick={() => loadMembers(members.page + 1)}
              >
                Показать ещё
              </button>
            ) : null}
          </div>
        )}

        {tab === "invite" ? (
          <footer className="course-invite-foot tw:flex tw:items-center tw:justify-end tw:gap-[12px] tw:p-[18px_32px_26px] tw:max-640:px-[16px] tw:[border-top:1px_solid_var(--invite-border)] tw:[&_.btn]:p-[13px_24px] tw:max-640:[&_.btn]:p-[12px_18px] tw:[&_.btn]:text-[1.02rem] tw:[&_.btn:disabled]:opacity-[0.55] tw:[&_.btn:disabled]:cursor-default tw:[&_.btn:disabled]:[transform:none] tw:max-640:[&_.btn]:whitespace-nowrap">
            <span className="course-invite-summary tw:mr-[auto] tw:text-(--muted) tw:text-[0.95rem] tw:max-640:hidden" aria-live="polite">
              {rows.length > 1 ? `Адресов: ${rows.length}` : ""}
            </span>
            <button
              type="button"
              className="btn btn-outline tw:text-[1.02rem] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[&&&&]:p-[13px_24px] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:disabled:opacity-[0.55] tw:disabled:cursor-default tw:max-640:[&&&&]:p-[12px_18px] tw:max-640:[&&]:whitespace-nowrap tw:hover:[transform:translateY(-1px)] tw:disabled:[transform:none]"
              onClick={onClose}
              disabled={isSending}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-solid tw:text-[1.02rem] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[&&&&]:p-[13px_24px] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:max-640:[&&&&]:p-[12px_18px] tw:hover:[transform:translateY(-1px)] tw:max-640:[&&]:whitespace-nowrap"
              // Не уводим фокус из поля: иначе blur добавит строку, окно вырастет
              // и кнопка «уедет» из-под курсора до того, как сработает click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={send}
              disabled={isSending || (!rows.length && !draft.trim())}
            >
              {isSending
                ? "Отправляем…"
                : rows.length > 1
                  ? `Пригласить (${rows.length})`
                  : "Пригласить"}
            </button>
          </footer>
        ) : null}
      </section>
    </div>,
    host,
  );
}
