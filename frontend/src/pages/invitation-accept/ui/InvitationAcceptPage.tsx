// Принятие приглашения по ссылке из письма: /invitations/:type/accept/:token,
// где type — course или organization. Для нового пользователя сначала создаём
// пароль; существующий пользователь входит и принимает приглашение.
import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { SectionTop } from "@/shared/ui/section-top";
import { COURSE_ROLE_LABEL, useStudentStore } from "@/entities/course";
import { usePermissionStore, useSessionStore } from "@/entities/session";
import { notify } from "@/shared/ui/toast";
import {
  acceptCourseInvitation,
  acceptOrganizationInvitation,
  describeAcceptError,
  INVITATION_TYPES,
  type InvitationType,
} from "@/entities/invitation";
import { isTokenExpired, type RawApiRecord } from "@/shared/api";
import { InvitationEntry } from "@/features/accept-invitation";

const ACCEPT: Record<
  InvitationType,
  (token: string) => Promise<RawApiRecord | null>
> = {
  course: acceptCourseInvitation,
  organization: acceptOrganizationInvitation,
};

function loginPathFor(
  pathname: string,
  params: Record<string, string> = {},
): string {
  const query = new URLSearchParams({ redirect: pathname, ...params });
  return `/login?${query.toString()}`;
}

function StatusIcon({ tone }: { tone: "success" | "error" | "pending" }) {
  return (
    <span
      className={`invite-accept-icon tw:justify-self-center tw:grid tw:w-[64px] tw:h-[64px] tw:rounded-[999px] tw:text-(--success-text) tw:text-[1.8rem] tw:font-[800] tw:[place-items:center] tw:[&.is-pending]:w-[48px] tw:[&.is-pending]:h-[48px] tw:[background:rgba(var(--accent-rgb),_0.22)] tw:[&.is-error]:text-[#b8443c] tw:[&.is-pending]:border-solid tw:[&.is-pending]:border-[rgba(var(--accent-rgb),_0.3)] tw:[&.is-error]:[background:rgba(199,_82,_74,_0.14)] tw:[&.is-pending]:[background:transparent] tw:dark:[.page_&.is-error]:text-[#f0978f] tw:[&.is-pending]:[border-width:3px] tw:[&.is-pending]:[border-top-color:rgba(var(--accent-rgb),_0.95)] tw:[&.is-pending]:animate-invite-accept-spin tw:motion-reduce:[&.is-pending]:[animation-duration:2.4s] is-${tone}`}
      aria-hidden="true"
    >
      {tone === "success" ? "✓" : tone === "error" ? "!" : ""}
    </span>
  );
}

interface AcceptState {
  status: "idle" | "accepting" | "done" | "error";
  result: RawApiRecord | null;
  error: unknown;
}

const isInvitationType = (value: string): value is InvitationType =>
  value in INVITATION_TYPES;

/** Принятие приглашения на курс или в организацию по ссылке из письма. */
export function InvitationAcceptPage() {
  const { type, token = "" } = useParams();
  return type === "organization" ? (
    <InvitationEntry key={token} token={token}>
      <ExistingInvitationAcceptPage />
    </InvitationEntry>
  ) : (
    <ExistingInvitationAcceptPage />
  );
}

function ExistingInvitationAcceptPage() {
  const { type = "", token = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useSessionStore((state) => state.accessToken);
  const refreshToken = useSessionStore((state) => state.refreshToken);
  const expiresAt = useSessionStore((state) => state.expiresAt);
  const userEmail = useSessionStore((state) =>
    String(state.user?.email || state.identity?.email || ""),
  );
  const loadIdentity = useSessionStore((state) => state.loadIdentity);
  const loadCurrentUser = useSessionStore((state) => state.loadCurrentUser);
  const logout = useSessionStore((state) => state.logout);
  const setPermissionsFromIdentity = usePermissionStore(
    (state) => state.setPermissionsFromIdentity,
  );
  const loadMyCourses = useStudentStore((state) => state.loadMyCourses);
  const isAuthenticated = Boolean(
    accessToken && expiresAt && (!isTokenExpired(expiresAt) || refreshToken),
  );
  const config = isInvitationType(type) ? INVITATION_TYPES[type] : undefined;
  const [state, setState] = useState<AcceptState>({
    status: "idle",
    result: null,
    error: null,
  });
  const startedFor = useRef("");
  // true, пока сами выходим из аккаунта и уводим на логин с нужными параметрами.
  const [isLeaving, setIsLeaving] = useState(false);

  // После принятия обновляем identity/права/профиль — членство могло изменить доступы.
  const refreshCurrentUser = async () => {
    const identity = await loadIdentity();
    if (identity) setPermissionsFromIdentity(identity);
    loadCurrentUser();
  };

  const accept = async () => {
    setState({ status: "accepting", result: null, error: null });
    try {
      const result = await ACCEPT[type as InvitationType](token);
      await refreshCurrentUser().catch(() => {});

      if (type === "course") {
        loadMyCourses?.().catch(() => {});
        const courseId = result?.course_id || result?.courseId;
        const roleLabel = COURSE_ROLE_LABEL[result?.role] || "участник";
        notify(`Вы присоединились к курсу · ${roleLabel}`);
        if (courseId) {
          navigate(`/course/${courseId}`, { replace: true });
          return;
        }
      } else {
        notify("Вы вступили в организацию");
      }
      setState({ status: "done", result, error: null });
    } catch (error) {
      setState({ status: "error", result: null, error });
    }
  };

  useEffect(() => {
    if (!config || !isAuthenticated || !token) return;
    const key = `${type}:${token}`;
    if (startedFor.current === key) return;
    startedFor.current = key;
    accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, isAuthenticated, token, type]);

  if (!config) return <Navigate to="/" replace />;

  const needsLogin =
    !isAuthenticated ||
    (state.status === "error" &&
      (state.error as { status?: number } | null)?.status === 401);
  if (needsLogin) {
    if (isLeaving) return null;
    // Адрес приглашения уходит в ?redirect=: после входа вернёмся сюда и примем его.
    return <Navigate to={loginPathFor(location.pathname)} replace />;
  }

  const switchAccount = async () => {
    setIsLeaving(true);
    await logout();
    navigate(loginPathFor(location.pathname), { replace: true });
  };

  // Токены выданы под конкретное членство, поэтому в новую организацию
  // можно попасть только через повторный вход — она будет выбрана заранее.
  const goToOrganization = async () => {
    const organizationId =
      state.result?.organization_id || state.result?.organizationId || "";
    setIsLeaving(true);
    await logout();
    navigate(
      loginPathFor(
        "/organizations",
        organizationId ? { organization: organizationId } : {},
      ),
      { replace: true },
    );
  };

  const errorInfo =
    state.status === "error" ? describeAcceptError(state.error, type) : null;
  const backLink =
    type === "course"
      ? { to: "/courses", label: "Каталог курсов" }
      : { to: "/profile", label: "В личный кабинет" };

  return (
    <section className="container section course-details-view course-invite-accept tw:relative tw:z-[1] tw:w-[min(1600px,_98vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:dark:[.page_&]:[--muted:#c4b9a7] tw:dark:[.page_&]:[--eyebrow:#a0c4ff] tw:dark:[.page_&]:[--ink-accent:#dfd2bf] tw:dark:[.page_&]:[--info-text:#b7ab99] tw:dark:[.page_&]:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:dark:[.page_&]:[--glass-bg-strong:rgba(44,_44,_44,_0.92)]">
      <SectionTop label="Приглашение" title={config.title} />
      <article
        className="glass-card course-invite-accept-card tw:w-[min(680px,_100%)] tw:m-[40px_auto_0] tw:grid tw:gap-[18px] tw:p-[44px_40px] tw:text-center tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] tw:[&_h2]:m-[0] tw:[&_h2]:text-[clamp(1.6rem,_2.6vw,_2.15rem)] tw:[&_h2]:leading-[1.2] tw:[&_p]:m-[0] tw:[&_p]:text-(--muted) tw:[&_p]:text-[1.1rem] tw:[&_p]:leading-[1.6]"
        aria-live="polite"
      >
        {state.status === "done" ? (
          <>
            <StatusIcon tone="success" />
            {type === "organization" ? (
              <>
                <h2>Вы вступили в организацию</h2>
                <p>
                  Чтобы перейти в неё, войдите ещё раз — новая организация будет
                  выбрана автоматически. Текущая сессия останется в прежней
                  организации.
                </p>
                <div className="course-invite-accept-actions tw:flex tw:flex-wrap tw:justify-center tw:gap-[12px] tw:mt-[8px] tw:[&_.btn]:p-[14px_26px] tw:[&_.btn]:text-[1.05rem]">
                  <button
                    type="button"
                    className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[.course-invite-accept-actions_&]:p-[14px_26px] tw:[.course-invite-accept-actions_&]:text-[1.05rem] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                    onClick={goToOrganization}
                  >
                    Перейти в организацию
                  </button>
                  <Link
                    className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[.course-invite-accept-actions_&]:p-[14px_26px] tw:[.course-invite-accept-actions_&]:text-[1.05rem] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                    to="/profile"
                  >
                    Остаться в текущей
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2>Вы присоединились к курсу</h2>
                <p>Курс уже появился в вашем списке.</p>
                <div className="course-invite-accept-actions tw:flex tw:flex-wrap tw:justify-center tw:gap-[12px] tw:mt-[8px] tw:[&_.btn]:p-[14px_26px] tw:[&_.btn]:text-[1.05rem]">
                  <Link
                    className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[.course-invite-accept-actions_&]:p-[14px_26px] tw:[.course-invite-accept-actions_&]:text-[1.05rem] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                    to="/profile"
                  >
                    В личный кабинет
                  </Link>
                </div>
              </>
            )}
          </>
        ) : errorInfo ? (
          <>
            <StatusIcon tone="error" />
            <h2>{errorInfo.title}</h2>
            <p>{errorInfo.text}</p>
            {userEmail && errorInfo.kind === "wrong-account" ? (
              <p className="invite-accept-identity tw:[.course-invite-accept-card_&]:text-[1rem] tw:[.course-invite-accept-card_&_strong]:text-(--text)">
                Сейчас вы вошли как <strong>{userEmail}</strong>
              </p>
            ) : null}
            <div className="course-invite-accept-actions tw:flex tw:flex-wrap tw:justify-center tw:gap-[12px] tw:mt-[8px] tw:[&_.btn]:p-[14px_26px] tw:[&_.btn]:text-[1.05rem]">
              {errorInfo.kind === "retry" ? (
                <button
                  type="button"
                  className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[.course-invite-accept-actions_&]:p-[14px_26px] tw:[.course-invite-accept-actions_&]:text-[1.05rem] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                  onClick={accept}
                >
                  Повторить
                </button>
              ) : null}
              {errorInfo.kind === "wrong-account" ? (
                <button
                  type="button"
                  className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[.course-invite-accept-actions_&]:p-[14px_26px] tw:[.course-invite-accept-actions_&]:text-[1.05rem] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                  onClick={switchAccount}
                >
                  Войти под другим аккаунтом
                </button>
              ) : null}
              {errorInfo.kind === "member" ? (
                <Link
                  className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[.course-invite-accept-actions_&]:p-[14px_26px] tw:[.course-invite-accept-actions_&]:text-[1.05rem] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                  to={type === "course" ? "/profile" : "/organizations"}
                >
                  {type === "course" ? "Мои курсы" : "К организации"}
                </Link>
              ) : null}
              <Link
                className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[.course-invite-accept-actions_&]:p-[14px_26px] tw:[.course-invite-accept-actions_&]:text-[1.05rem] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                to={backLink.to}
              >
                {backLink.label}
              </Link>
            </div>
          </>
        ) : (
          <>
            <StatusIcon tone="pending" />
            <h2>Принимаем приглашение…</h2>
            <p>Это займёт пару секунд.</p>
          </>
        )}
      </article>
    </section>
  );
}

// Ссылки из писем бэкенда (/courses/invitations/accept/:token и т.п.) ведут
// на общий маршрут с типом приглашения.
export function InvitationLinkRedirect({ type }: { type: InvitationType }) {
  const { token = "" } = useParams();
  return (
    <Navigate
      to={`/invitations/${type}/accept/${encodeURIComponent(token)}`}
      replace
    />
  );
}
