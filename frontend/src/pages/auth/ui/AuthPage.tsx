import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSessionStore, type Membership } from "@/entities/session";
import { isTokenExpired } from "@/shared/api";
import { InvitationEntry } from "@/features/accept-invitation";

type AuthMode = "login" | "register";

function getRedirectPath(search: string): string {
  const params = new URLSearchParams(search);
  const redirect = params.get("redirect");
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return "/profile";
  }

  const redirectPathname = redirect.split(/[?#]/, 1)[0];
  return ["/login", "/register"].includes(redirectPathname)
    ? "/profile"
    : redirect;
}

// После принятия приглашения в организацию сюда приходят с ?organization=<id>,
// чтобы на шаге выбора организации она уже была отмечена.
function getPreferredOrganizationId(search: string): string {
  return new URLSearchParams(search).get("organization") || "";
}

function getMembershipOrganizationId(
  membership: Membership | null | undefined,
): string {
  return (
    membership?.organization_id ||
    membership?.organizationId ||
    membership?.organization?.id ||
    ""
  );
}

function getMembershipId(
  membership: Membership | null | undefined,
): string | undefined {
  return membership?.id || membership?.membership_id;
}

function getOrganizationName(
  membership: Membership | null | undefined,
): string {
  return (
    membership?.organization?.name ||
    membership?.organization_name ||
    membership?.organization?.title ||
    "Организация без названия"
  );
}

/** Вход и регистрация; вход по ссылке приглашения начинается с регистрации. */
export function AuthPage({ mode = "login" }: { mode?: AuthMode }) {
  const location = useLocation();
  const redirect = getRedirectPath(location.search);
  const invitation = redirect.match(/^\/invitations\/organization\/accept\/([^/?#]+)$/);
  const explicitLogin = new URLSearchParams(location.search).get("invitationLogin") === "1";
  return invitation && !explicitLogin ? (
    <InvitationEntry key={invitation[1]} token={invitation[1]}><ExistingAuthPage mode={mode} /></InvitationEntry>
  ) : <ExistingAuthPage mode={mode} />;
}

function ExistingAuthPage({ mode = "login" }: { mode?: AuthMode }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath = useMemo(
    () => getRedirectPath(location.search),
    [location.search],
  );
  const accessToken = useSessionStore((state) => state.accessToken);
  const refreshToken = useSessionStore((state) => state.refreshToken);
  const expiresAt = useSessionStore((state) => state.expiresAt);
  const membershipId = useSessionStore((state) => state.membershipId);
  const organizationId = useSessionStore((state) => state.organizationId);
  const loginStep = useSessionStore((state) => state.loginStep);
  const memberships = useSessionStore((state) => state.memberships);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);
  const validationErrors = useSessionStore((state) => state.validationErrors);
  const loginWithCredentials = useSessionStore(
    (state) => state.loginWithCredentials,
  );
  const selectMembership = useSessionStore((state) => state.selectMembership);
  const resetOrganizationSelection = useSessionStore(
    (state) => state.resetOrganizationSelection,
  );
  const [selectedMembershipId, setSelectedMembershipId] = useState("");
  const preferredOrganizationId = useMemo(
    () => getPreferredOrganizationId(location.search),
    [location.search],
  );
  const isInvitationRedirect = redirectPath.startsWith("/invitations/");

  useEffect(() => {
    const hasActiveSession = Boolean(
      accessToken &&
      expiresAt &&
      (!isTokenExpired(expiresAt) || refreshToken) &&
      (membershipId || organizationId),
    );
    if (hasActiveSession) {
      navigate(redirectPath, { replace: true });
    }
  }, [
    accessToken,
    expiresAt,
    membershipId,
    navigate,
    organizationId,
    redirectPath,
    refreshToken,
  ]);

  useEffect(() => {
    if (selectedMembershipId || !memberships.length) return;
    const preferred = preferredOrganizationId
      ? memberships.find(
          (membership) =>
            getMembershipOrganizationId(membership) === preferredOrganizationId,
        )
      : null;
    if (preferred) {
      setSelectedMembershipId(getMembershipId(preferred) || "");
    } else if (memberships.length === 1) {
      setSelectedMembershipId(getMembershipId(memberships[0]) || "");
    }
  }, [memberships, preferredOrganizationId, selectedMembershipId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    if (isRegister) {
      return;
    }

    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      return;
    }

    try {
      await loginWithCredentials({ email, password });
    } catch {
      // Ошибка уже нормализована и сохранена в session store без чувствительных данных.
    }
  };

  const handleSelectMembership = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMembershipId) return;

    try {
      await selectMembership(selectedMembershipId);
    } catch {
      // Ошибка выбора организации отображается ниже.
    }
  };

  return (
    <section
      className={`container section auth-view tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:min-h-[650px] tw:grid tw:items-center tw:max-760:min-h-[auto] tw:max-760:pt-[24px] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:[&.auth-view-organization_.auth-layout]:grid-cols-[minmax(0,_0.95fr)_minmax(400px,_480px)] tw:[&.auth-view-organization_.auth-layout]:gap-[72px] ${loginStep === "organization" ? "auth-view-organization" : ""}`}
    >
      <div className="auth-layout tw:w-[min(1120px,_100%)] tw:m-[0_auto] tw:grid tw:grid-cols-[minmax(0,_1fr)_minmax(400px,_480px)] tw:gap-[64px] tw:items-center tw:max-1100:grid-cols-[1fr] tw:max-1100:gap-[28px] tw:max-760:gap-[22px]">
        <div className="auth-intro tw:max-w-[540px] tw:min-w-[0] tw:max-1100:max-w-[620px]">
          <span className="section-top-label">AI Course Lab</span>
          <h1
            className={
              `tw:max-w-[100%] tw:m-[14px_0_16px] tw:text-[clamp(1.8rem,_3.4vw,_2.75rem)] tw:leading-[1.18] tw:wrap-anywhere tw:tracking-[-0.025em] tw:[font-family:'Unbounded',_sans-serif] tw:[.auth-intro_&.auth-login-title]:whitespace-nowrap ${(isRegister || loginStep === "organization"
                ? undefined
                : "auth-login-title") ?? ""}`
            }
          >
            {isRegister
              ? "Создайте учебный профиль"
              : loginStep === "organization"
                ? "Продолжите в организации"
                : isInvitationRedirect
                  ? "Вас пригласили"
                  : "С возвращением"}
          </h1>
          <p className="tw:max-w-[460px] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
            {loginStep === "organization"
              ? preferredOrganizationId
                ? "Организация, в которую вы вступили по приглашению, уже выбрана — нажмите «Продолжить»."
                : "Выбор организации определяет рабочее пространство, роли и доступные курсы. Для смены организации нужно войти заново."
              : isInvitationRedirect
                ? "Войдите в аккаунт, на email которого пришло письмо, — приглашение примется автоматически."
                : preferredOrganizationId
                  ? "Войдите ещё раз, чтобы перейти в организацию, в которую вы вступили."
                  : "Сохраняйте прогресс, проходите курсы и возвращайтесь к материалам с любого устройства."}
          </p>
        </div>

        <div className="glass-card auth-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:z-[1] tw:p-[34px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--surface)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
          <div className="auth-card-head tw:grid tw:gap-[8px] tw:pb-[20px] tw:[border-bottom:1px_solid_rgba(var(--accent-rgb),_0.26)]">
            <span className="tw:text-(--muted) tw:text-[0.9rem] tw:font-[700]">{isRegister ? "Новый профиль" : "Вход в платформу"}</span>
            <strong className="tw:text-(--heading) tw:text-[1.55rem]">
              {isRegister
                ? "Регистрация"
                : loginStep === "organization"
                  ? "Организация"
                  : "Авторизация"}
            </strong>
          </div>

          {isRegister ? (
            <div className="auth-form tw:grid tw:gap-[18px] tw:mt-[24px]">
              <p className="auth-notice tw:m-[14px_0_0] tw:p-[12px_14px] tw:rounded-[10px] tw:text-[#7a1b12] tw:text-[1rem] tw:font-[800] tw:leading-[1.72] tw:tracking-[0.012em] tw:[border:1px_solid_#b42318] tw:[background:rgba(180,_35,_24,_0.12)] tw:[box-shadow:0_8px_22px_rgba(180,_35,_24,_0.12)]">Регистрация пока не подключена.</p>
              <Link className="btn btn-solid auth-submit tw:w-[100%] tw:min-h-[54px] tw:justify-center tw:mt-[4px] tw:text-[1.05rem] tw:inline-flex tw:items-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]" to="/login">
                Войти
              </Link>
            </div>
          ) : loginStep === "organization" ? (
            <form className="auth-form tw:grid tw:gap-[18px] tw:mt-[24px]" onSubmit={handleSelectMembership}>
              <div className="auth-organization-list tw:grid tw:gap-[10px]">
                {memberships.length ? (
                  memberships.map((membership) => {
                    const membershipId = getMembershipId(membership);
                    return (
                      <label
                        className="auth-organization-option tw:grid tw:gap-[8px] tw:grid-cols-[auto_minmax(0,_1fr)] tw:items-center tw:rounded-[14px] tw:p-[16px] tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.28)]"
                        key={membershipId}
                      >
                        <input className="tw:w-[auto] tw:min-h-[auto] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.32)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_16px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.82)] tw:[.auth-form_&[aria-invalid=true]]:border-[#b42318] tw:[background:var(--bg)] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[outline:none] tw:[.auth-form_&[aria-invalid=true]]:[background:rgba(180,_35,_24,_0.08)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.12)] tw:[.auth-form_&[aria-invalid=true]]:[box-shadow:0_0_0_3px_rgba(180,_35,_24,_0.14)]"
                          type="radio"
                          name="membership"
                          value={membershipId}
                          checked={selectedMembershipId === membershipId}
                          onChange={() =>
                            setSelectedMembershipId(membershipId || "")
                          }
                        />
                        <span className="tw:text-(--text) tw:text-[0.95rem] tw:font-[800] tw:min-w-[0]">
                          <strong className="tw:block tw:wrap-anywhere">{getOrganizationName(membership)}</strong>
                          {membership?.joined_at && (
                            <small>
                              Участник с{" "}
                              {new Date(
                                membership.joined_at,
                              ).toLocaleDateString("ru-RU")}
                            </small>
                          )}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="auth-notice tw:m-[14px_0_0] tw:p-[12px_14px] tw:rounded-[10px] tw:text-[#7a1b12] tw:text-[0.98rem] tw:font-[800] tw:leading-[1.45] tw:[border:1px_solid_#b42318] tw:[background:rgba(180,_35,_24,_0.12)] tw:[box-shadow:0_8px_22px_rgba(180,_35,_24,_0.12)]">
                    Для этого пользователя не найдено доступных организаций.
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="btn btn-solid auth-submit tw:w-[100%] tw:min-h-[54px] tw:justify-center tw:mt-[4px] tw:text-[0.96rem] tw:inline-flex tw:items-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                disabled={isLoading || !selectedMembershipId}
              >
                {isLoading ? "Получаем токены..." : "Продолжить"}
              </button>
              <button
                type="button"
                className="btn btn-ghost auth-submit tw:w-[100%] tw:min-h-[54px] tw:justify-center tw:mt-[4px] tw:text-[0.96rem] tw:inline-flex tw:items-center tw:rounded-[999px] tw:p-[12px_20px] tw:font-[700] tw:tracking-[0.01em] tw:leading-[1.45] tw:[text-decoration:none] tw:[border:1px_solid_transparent] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:hover:[transform:translateY(-1px)]"
                onClick={resetOrganizationSelection}
                disabled={isLoading}
              >
                Войти заново
              </button>
            </form>
          ) : (
            <form className="auth-form tw:grid tw:gap-[18px] tw:mt-[24px]" onSubmit={handleSubmit} noValidate>
              <label className="tw:grid tw:gap-[8px]">
                <span className="tw:text-(--text) tw:text-[0.95rem] tw:font-[800]">Email</span>
                <input className="tw:w-[100%] tw:min-h-[54px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.32)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_16px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.82)] tw:[.auth-form_&[aria-invalid=true]]:border-[#b42318] tw:[background:var(--bg)] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[outline:none] tw:[.auth-form_&[aria-invalid=true]]:[background:rgba(180,_35,_24,_0.08)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.12)] tw:[.auth-form_&[aria-invalid=true]]:[box-shadow:0_0_0_3px_rgba(180,_35,_24,_0.14)]"
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  aria-invalid={Boolean(validationErrors.email)}
                />
                {validationErrors.email && (
                  <small className="auth-field-error tw:block tw:p-[8px_10px] tw:rounded-[8px] tw:text-[#7a1b12] tw:text-[0.9rem] tw:font-[800] tw:leading-[1.35] tw:[background:rgba(180,_35,_24,_0.12)]">
                    {validationErrors.email}
                  </small>
                )}
              </label>
              <label className="tw:grid tw:gap-[8px]">
                <span className="tw:text-(--text) tw:text-[0.95rem] tw:font-[800]">Пароль</span>
                <input className="tw:w-[100%] tw:min-h-[54px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.32)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_16px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.82)] tw:[.auth-form_&[aria-invalid=true]]:border-[#b42318] tw:[background:var(--bg)] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[outline:none] tw:[.auth-form_&[aria-invalid=true]]:[background:rgba(180,_35,_24,_0.08)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.12)] tw:[.auth-form_&[aria-invalid=true]]:[box-shadow:0_0_0_3px_rgba(180,_35,_24,_0.14)]"
                  type="password"
                  name="password"
                  placeholder="Введите пароль"
                  required
                  aria-invalid={Boolean(validationErrors.password)}
                />
                {validationErrors.password && (
                  <small className="auth-field-error tw:block tw:p-[8px_10px] tw:rounded-[8px] tw:text-[#7a1b12] tw:text-[0.9rem] tw:font-[800] tw:leading-[1.35] tw:[background:rgba(180,_35,_24,_0.12)]">
                    {validationErrors.password}
                  </small>
                )}
              </label>
              <button
                type="submit"
                className="btn btn-solid auth-submit tw:w-[100%] tw:min-h-[54px] tw:justify-center tw:mt-[4px] tw:text-[0.96rem] tw:inline-flex tw:items-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                disabled={isLoading}
              >
                {isLoading ? "Вход..." : "Войти"}
              </button>
            </form>
          )}

          {error && <p className="auth-notice tw:m-[14px_0_0] tw:p-[12px_14px] tw:rounded-[10px] tw:text-[#7a1b12] tw:text-[1rem] tw:font-[800] tw:leading-[1.72] tw:tracking-[0.012em] tw:[border:1px_solid_#b42318] tw:[background:rgba(180,_35,_24,_0.12)] tw:[box-shadow:0_8px_22px_rgba(180,_35,_24,_0.12)]">{error}</p>}

          {!isRegister && loginStep === "credentials" && (
            <p className="auth-switch tw:m-[22px_0_0] tw:text-(--muted) tw:text-[1rem] tw:text-center tw:leading-[1.72] tw:tracking-[0.012em]">
              Еще нет профиля? <Link className="tw:text-(--ink-accent) tw:font-[800]" to="/register">Зарегистрироваться</Link>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
