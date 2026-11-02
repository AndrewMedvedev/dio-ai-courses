import { useEffect, useState } from "react";
import {
  fetchOrganizationInvitations,
  resendOrganizationInvitation,
  revokeOrganizationInvitation,
  type OrganizationInvitation,
} from "@/entities/invitation";
import type { Paginated } from "@/shared/api";
import { usePermissionStore } from "@/entities/session";
import { notify } from "@/shared/ui/toast";

const STATUS: Record<string, string> = { pending: "Ожидает принятия", accepted: "Принято", expired: "Срок истёк", revoked: "Отозвано" };
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ru-RU") : "—";

/** Отправленные приглашения в организацию: повтор отправки и отзыв. */
export function OrganizationInvitations({ revision }: { revision?: number }) {
  const canRevoke = usePermissionStore((state) => state.hasPermission("organization-invitations:delete"));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<OrganizationInvitation> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setConfirmation("");
    fetchOrganizationInvitations(page).then((result) => {
      if (active) setData(result);
    }).catch(() => {
      if (active) setError("Не удалось загрузить приглашения. Повторите попытку.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, revision, refresh]);

  const act = async (
    invitation: OrganizationInvitation,
    action: "revoke" | "resend",
  ) => {
    if (pending) return;
    setPending(`${invitation.source}:${invitation.id}`);
    setError("");
    try {
      await (action === "revoke" ? revokeOrganizationInvitation : resendOrganizationInvitation)(invitation.id, invitation.source);
      notify(action === "revoke" ? "Приглашение отозвано" : "Приглашение отправлено повторно");
      setConfirmation("");
      setRefresh((value) => value + 1);
    } catch (rawFailure) {
      const failure = rawFailure as { status?: number } | null;
      setError(failure?.status === 403 ? "Недостаточно прав для этого действия."
        : failure?.status === 409 ? "Статус приглашения изменился или пользователь уже состоит в организации. Обновите список."
        : "Не удалось выполнить действие. Обновите список и попробуйте ещё раз.");
    } finally { setPending(""); }
  };

  return (
    <article className="glass-card organization-panel tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[24px] tw:grid tw:gap-[18px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]" aria-busy={loading}>
      <div className="organization-panel-head tw:flex tw:items-start tw:justify-between tw:gap-[16px] tw:max-760:flex-col">
        <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em]">Отправленные приглашения</h3>
        <button type="button" className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]" disabled={loading || Boolean(pending)} onClick={() => setRefresh((value) => value + 1)}>Обновить</button>
      </div>
      {error && <p role="alert" className="auth-field-error tw:block tw:p-[8px_10px] tw:rounded-[8px] tw:text-[#7a1b12] tw:text-[0.9rem] tw:font-[800] tw:leading-[1.35] tw:[background:rgba(180,_35,_24,_0.12)]">{error}</p>}
      {loading ? <p role="status">Загружаем приглашения…</p> : data && (
        <>
          {!data.items.length && <p className="organization-muted tw:text-(--muted)">Приглашения ещё не отправлены.</p>}
          <div className="organization-list tw:grid tw:gap-[16px]">
            {data.items.map((invitation) => {
              const key = `${invitation.source}:${invitation.id}`;
              const actionable = ["pending", "expired"].includes(invitation.status);
              return (
                <article className="organization-card tw:rounded-[18px] tw:p-[18px] tw:grid tw:gap-[14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[background:rgba(var(--accent-rgb),_0.05)]" key={key}>
                  <div className="organization-panel-head tw:flex tw:items-start tw:justify-between tw:gap-[16px] tw:max-760:flex-col">
                    <strong className="organization-invitation-email tw:wrap-anywhere tw:min-w-[0]">{invitation.email}</strong>
                    <span role="status">{STATUS[invitation.status] || invitation.status}</span>
                  </div>
                  <p className="organization-muted tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">Создано: {date(invitation.created_at)} · Действует до: {date(invitation.expires_at)}</p>
                  {invitation.used_at && <p className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">Принято: {date(invitation.used_at)}</p>}
                  {invitation.revoked_at && <p>Отозвано: {date(invitation.revoked_at)}</p>}
                  {actionable && <div className="organization-panel-actions tw:flex tw:flex-wrap tw:justify-end tw:gap-[10px] tw:max-760:justify-start">
                    <button type="button" className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]" disabled={Boolean(pending)} onClick={() => act(invitation, "resend")}>Повторить отправку</button>
                    {canRevoke && (confirmation === key ? <>
                      <span>Отозвать приглашение?</span>
                      <button type="button" className="btn btn-outline organization-danger-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(180,_35,_24,_0.34)] tw:font-[700] tw:tracking-[0.01em] tw:text-[#b42318] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[justify-self:start] tw:hover:[transform:translateY(-1px)]" disabled={Boolean(pending)} onClick={() => act(invitation, "revoke")}>Да, отозвать</button>
                      <button type="button" className="btn btn-ghost tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:font-[700] tw:tracking-[0.01em] tw:[text-decoration:none] tw:[border:1px_solid_transparent] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:hover:[transform:translateY(-1px)]" disabled={Boolean(pending)} onClick={() => setConfirmation("")}>Отмена</button>
                    </> : <button type="button" className="btn btn-outline organization-danger-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(180,_35,_24,_0.34)] tw:font-[700] tw:tracking-[0.01em] tw:text-[#b42318] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[justify-self:start] tw:hover:[transform:translateY(-1px)]" disabled={Boolean(pending)} onClick={() => setConfirmation(key)}>Отозвать</button>)}
                    {pending === key && <span role="status">Выполняем…</span>}
                  </div>}
                </article>
              );
            })}
          </div>
          {(data.pages ?? 0) > 1 && <nav className="organization-panel-actions tw:flex tw:flex-wrap tw:justify-end tw:gap-[10px] tw:max-760:justify-start" aria-label="Страницы приглашений">
            <button type="button" className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]" disabled={page <= 1 || Boolean(pending)} onClick={() => setPage((value) => value - 1)}>Назад</button>
            <span>{page} / {data.pages}</span>
            <button type="button" className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]" disabled={page >= (data.pages ?? 0) || Boolean(pending)} onClick={() => setPage((value) => value + 1)}>Вперёд</button>
          </nav>}
        </>
      )}
    </article>
  );
}
