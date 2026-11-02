import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  acceptInvitation,
  previewInvitation,
  type InvitationPreview,
} from "@/entities/invitation";
import { useSessionStore, usePermissionStore } from "@/entities/session";
import { notify } from "@/shared/ui/toast";

// The token determines the email and whether registration is available.
// Existing users keep the normal login/accept flow passed as children.
interface InvitationFailure {
  status?: number;
  validationErrors?: Record<string, string>;
}

export function InvitationEntry({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<InvitationFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const loginPath = `/login?${new URLSearchParams({
    redirect: `/invitations/organization/accept/${encodeURIComponent(token)}`,
    invitationLogin: "1",
  })}`;

  useEffect(() => {
    let active = true;
    setPreview(null);
    setLoadError(null);
    setPassword("");
    setConfirmation("");
    setError("");
    previewInvitation(token).then(
      (result) => { if (active) setPreview(result); },
      (failure) => { if (active) setLoadError(failure); },
    );
    return () => { active = false; };
  }, [token, attempt]);

  if (preview && !preview.registration_required) return <>{children}</>;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (password !== confirmation) {
      setError("Пароли не совпадают. Проверьте повторный ввод.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const tokens = await acceptInvitation({ token, password });
      const session = useSessionStore.getState();
      session.clearSession();
      usePermissionStore.getState().resetPermissions();
      session.setTokens(tokens);
      // Registration already succeeded: profile loading must not invite a second submission.
      session.loadIdentity().then((identity) => {
        if (identity) usePermissionStore.getState().setPermissionsFromIdentity(identity);
      }).catch(() => {});
      session.loadCurrentUser().catch(() => {});
      notify("Аккаунт создан. Приглашение принято!");
      navigate("/profile", { replace: true });
    } catch (rawFailure) {
      const failure = rawFailure as InvitationFailure;
      if (failure.status === 404) setLoadError(failure);
      else if (failure.status === 409) {
        setError("Аккаунт с этим email уже существует. Войдите с вашим паролем.");
      } else {
        setError(failure.validationErrors?.password || (failure.status === 422 || failure.status === 400
          ? "Пароль недостаточно надёжный. Используйте длинный уникальный пароль без имени и email."
          : "Не удалось создать аккаунт. Проверьте соединение и попробуйте ещё раз."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const invalid = loadError?.status === 404;
  return (
    <section className="container section auth-view tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:min-h-[650px] tw:grid tw:items-center tw:max-760:min-h-[auto] tw:max-760:pt-[24px] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]">
      <div className="auth-layout tw:w-[min(1120px,_100%)] tw:m-[0_auto] tw:grid tw:grid-cols-[minmax(0,_1fr)_minmax(400px,_480px)] tw:gap-[64px] tw:items-center tw:max-1100:grid-cols-[1fr] tw:max-1100:gap-[28px] tw:max-760:gap-[22px]">
        <div className="auth-intro tw:max-w-[540px] tw:min-w-[0] tw:max-1100:max-w-[620px]">
          <span className="section-top-label">AI Course Lab · Приглашение</span>
          <h1 className="tw:max-w-[100%] tw:m-[14px_0_16px] tw:text-[clamp(1.8rem,_3.4vw,_2.75rem)] tw:leading-[1.18] tw:wrap-anywhere tw:tracking-[-0.025em] tw:[font-family:'Unbounded',_sans-serif]">{loadError ? "Проверьте приглашение" : "Добро пожаловать в команду"}</h1>
          <p className="tw:max-w-[460px] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">Создайте пароль, чтобы принять приглашение и начать обучение. Вводить email не нужно — он уже указан в приглашении.</p>
        </div>
        <div className="glass-card auth-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:z-[1] tw:p-[34px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--surface)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]" aria-busy={(!preview && !loadError) || submitting}>
          <div className="auth-card-head tw:grid tw:gap-[8px] tw:pb-[20px] tw:[border-bottom:1px_solid_rgba(var(--accent-rgb),_0.26)]">
            <span className="tw:text-(--muted) tw:text-[0.9rem] tw:font-[700]">Регистрация по приглашению</span>
            <strong className="tw:text-(--heading) tw:text-[1.55rem]">{loadError ? "Не удалось продолжить" : "Создайте пароль"}</strong>
          </div>
          {loadError ? (
            <div className="auth-form tw:grid tw:gap-[18px] tw:mt-[24px]" role="alert">
              <p className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">{invalid
                ? "Ссылка недействительна: приглашение использовано, отозвано или срок его действия истёк. Попросите администратора отправить новое приглашение."
                : "Не удалось проверить приглашение. Проверьте соединение и повторите попытку."}</p>
              {!invalid && <button className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]" onClick={() => setAttempt((value) => value + 1)}>Повторить</button>}
              <Link className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]" to={loginPath}>Перейти ко входу</Link>
            </div>
          ) : !preview ? <p role="status">Проверяем приглашение…</p> : (
            <form className="auth-form tw:grid tw:gap-[18px] tw:mt-[24px]" onSubmit={submit}>
              <p className="auth-notice tw:m-[14px_0_0] tw:p-[12px_14px] tw:rounded-[10px] tw:text-[#7a1b12] tw:text-[1rem] tw:font-[800] tw:leading-[1.72] tw:tracking-[0.012em] tw:[border:1px_solid_#b42318] tw:[background:rgba(180,_35,_24,_0.12)] tw:[box-shadow:0_8px_22px_rgba(180,_35,_24,_0.12)]">Ваш аккаунт: <strong>{preview.email}</strong><br />Email подтверждён ссылкой из письма.</p>
              {preview.organization_name && <p className="auth-notice tw:m-[14px_0_0] tw:p-[12px_14px] tw:rounded-[10px] tw:text-[#7a1b12] tw:text-[1rem] tw:font-[800] tw:leading-[1.72] tw:tracking-[0.012em] tw:[border:1px_solid_#b42318] tw:[background:rgba(180,_35,_24,_0.12)] tw:[box-shadow:0_8px_22px_rgba(180,_35,_24,_0.12)]">Организация: <strong>{preview.organization_name}</strong></p>}
              <label className="tw:grid tw:gap-[8px]">
                <span className="tw:text-(--text) tw:text-[0.95rem] tw:font-[800]">Новый пароль</span>
                <input className="tw:w-[100%] tw:min-h-[54px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.32)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_16px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.82)] tw:[.auth-form_&[aria-invalid=true]]:border-[#b42318] tw:[background:var(--bg)] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[outline:none] tw:[.auth-form_&[aria-invalid=true]]:[background:rgba(180,_35,_24,_0.08)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.12)] tw:[.auth-form_&[aria-invalid=true]]:[box-shadow:0_0_0_3px_rgba(180,_35,_24,_0.14)]" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required
                  value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }}
                  disabled={submitting} aria-describedby="invite-password-hint invite-password-error" />
              </label>
              <small id="invite-password-hint">Используйте длинный уникальный пароль: например, несколько несвязанных слов с цифрами и символами.</small>
              <label className="tw:grid tw:gap-[8px]">
                <span className="tw:text-(--text) tw:text-[0.95rem] tw:font-[800]">Повторите пароль</span>
                <input className="tw:w-[100%] tw:min-h-[54px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.32)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_16px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.82)] tw:[.auth-form_&[aria-invalid=true]]:border-[#b42318] tw:[background:var(--bg)] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[outline:none] tw:[.auth-form_&[aria-invalid=true]]:[background:rgba(180,_35,_24,_0.08)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.12)] tw:[.auth-form_&[aria-invalid=true]]:[box-shadow:0_0_0_3px_rgba(180,_35,_24,_0.14)]" name="passwordConfirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" required
                  value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(""); }}
                  disabled={submitting} aria-invalid={Boolean(error)} aria-describedby="invite-password-error" />
              </label>
              <button type="button" className="btn btn-ghost tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:font-[700] tw:tracking-[0.01em] tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border:1px_solid_transparent] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:hover:[transform:translateY(-1px)]" aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Скрыть пароли" : "Показать пароли"}</button>
              <p id="invite-password-error" className="auth-field-error tw:block tw:p-[8px_10px] tw:rounded-[8px] tw:text-[#7a1b12] tw:text-[1rem] tw:font-[800] tw:leading-[1.72] tw:tracking-[0.012em] tw:[background:rgba(180,_35,_24,_0.12)]" role="alert">{error}</p>
              <button type="submit" className="btn btn-solid auth-submit tw:w-[100%] tw:min-h-[54px] tw:justify-center tw:mt-[4px] tw:text-[0.96rem] tw:inline-flex tw:items-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]" disabled={submitting || !password || !confirmation}>
                {submitting ? "Создаём аккаунт…" : "Создать аккаунт и принять приглашение"}
              </button>
              <small>После регистрации вы автоматически войдёте в аккаунт.</small>
              <p className="auth-switch tw:m-[22px_0_0] tw:text-(--muted) tw:text-[1rem] tw:text-center tw:leading-[1.72] tw:tracking-[0.012em]">Уже зарегистрированы? <Link className="tw:text-(--ink-accent) tw:font-[800]" to={loginPath}>Войти в аккаунт</Link></p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
