import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { SectionTop } from "@/shared/ui/section-top";
import { InviteDialog, OrganizationInvitations } from "@/features/invite";
import { useSessionStore } from "@/entities/session";
import {
  createOrganization,
  deleteOrganization,
  fetchOrganizationById,
  fetchOrganizationsPage,
  updateOrganization,
  type Organization,
} from "@/entities/organization";

interface OrganizationFormValues {
  name: string;
  email: string;
  description: string;
}

type FormField = keyof OrganizationFormValues;
type FieldErrors = Record<string, string>;

/** Ошибка API: текст для пользователя и ошибки полей. */
interface MutationError {
  userMessage?: string;
  message?: string;
  validationErrors?: FieldErrors;
}

const asMutationError = (error: unknown) =>
  (error ?? {}) as MutationError;

type Section = "current" | "create" | "all" | "details";

const EMPTY_FORM: OrganizationFormValues = {
  name: "",
  email: "",
  description: "",
};

function organizationToForm(
  organization: Organization | null | undefined,
): OrganizationFormValues {
  return {
    name: organization?.name || "",
    email: organization?.email || "",
    description: organization?.description || "",
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="organization-field-error tw:text-[#b42318] tw:text-[0.78rem] tw:font-[700]">{message}</span>
  ) : null;
}

function OrganizationMeta({ organization }: { organization: Organization }) {
  return (
    <dl className="organization-meta tw:m-[0] tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[12px] tw:max-760:grid-cols-[1fr]">
      <div className="tw:min-w-[0]">
        <dt className="tw:text-(--muted) tw:text-[0.76rem] tw:font-[800] tw:uppercase">Создана</dt>
        <dd className="tw:m-[4px_0_0] tw:text-(--text) tw:wrap-anywhere">{formatDate(organization.created_at)}</dd>
      </div>
      <div className="tw:min-w-[0]">
        <dt className="tw:text-(--muted) tw:text-[0.76rem] tw:font-[800] tw:uppercase">Обновлена</dt>
        <dd className="tw:m-[4px_0_0] tw:text-(--text) tw:wrap-anywhere">{formatDate(organization.updated_at)}</dd>
      </div>
    </dl>
  );
}

function OrganizationHeader({
  organization,
  kicker,
  isEditing = false,
  editForm = EMPTY_FORM,
  validationErrors = {},
  onEditChange,
  onOpen,
  children,
}: {
  organization: Organization;
  kicker?: string;
  isEditing?: boolean;
  editForm?: OrganizationFormValues;
  validationErrors?: FieldErrors;
  onEditChange?: (field: FormField, value: string) => void;
  onOpen?: (organization: Organization) => void;
  children?: ReactNode;
}) {
  return (
    <div className="organization-card-summary tw:flex tw:items-start tw:justify-between tw:gap-[16px] tw:max-760:flex-col">
      <div className="organization-card-title tw:min-w-[0] tw:grid tw:gap-[10px]">
        {kicker && <span className="organization-kicker tw:text-(--muted) tw:inline-flex tw:mb-[6px] tw:text-[0.78rem] tw:font-[800] tw:tracking-[0.03em] tw:uppercase">{kicker}</span>}
        {isEditing ? (
          <>
            <label className="organization-inline-field tw:grid tw:gap-[7px]">
              <span>Название</span>
              <input
                value={editForm.name}
                maxLength={255}
                onChange={(event) => onEditChange?.("name", event.target.value)}
              />
              <FieldError message={validationErrors.name} />
            </label>
            <label className="organization-inline-field tw:grid tw:gap-[7px]">
              <span>Email</span>
              <input
                type="email"
                value={editForm.email}
                onChange={(event) =>
                  onEditChange?.("email", event.target.value)
                }
              />
              <FieldError message={validationErrors.email} />
            </label>
          </>
        ) : onOpen ? (
          <button
            type="button"
            className="organization-open-field tw:w-[fit-content] tw:max-w-[100%] tw:text-[inherit] tw:p-[0] tw:text-left tw:grid tw:gap-[6px] tw:cursor-pointer tw:[border:0] tw:[background:transparent] tw:[font:inherit]"
            onClick={() => onOpen(organization)}
          >
            <strong>{organization.name}</strong>
            <span>{organization.email}</span>
          </button>
        ) : (
          <>
            <h4 className="tw:[.organization-card_&]:m-[0] tw:[.organization-card_&]:text-(--heading)">{organization.name}</h4>
            <p className="tw:text-(--muted) tw:m-[6px_0_0] tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">{organization.email}</p>
          </>
        )}
      </div>
      <div className="organization-card-actions tw:flex tw:items-center tw:flex-wrap tw:gap-[10px] tw:justify-end tw:max-760:justify-start">
        <span
          className={
            `tw:[&.organization-status]:flex-[0_0_auto] tw:[&.organization-status]:border-solid tw:[&.organization-status.is-inactive]:border-[rgba(180,_35,_24,_0.34)] tw:[&.organization-status]:rounded-[999px] tw:[&.organization-status]:p-[6px_10px] tw:[&.organization-status.is-inactive]:text-[#b42318] tw:[&.organization-status]:text-[0.78rem] tw:[&.organization-status]:font-[800] tw:[&.organization-status]:[border-width:1px] ${organization.is_active
              ? "organization-status"
              : "organization-status is-inactive"}`
          }
        >
          {organization.is_active ? "Активна" : "Неактивна"}
        </span>
        {children}
      </div>
    </div>
  );
}

function OrganizationForm({
  form,
  submitLabel,
  pendingLabel,
  isPending = false,
  validationErrors = {},
  onChange,
  onSubmit,
  onCancel,
  required = false,
}: {
  form: OrganizationFormValues;
  submitLabel: string;
  pendingLabel: string;
  isPending?: boolean;
  validationErrors?: FieldErrors;
  onChange: (field: FormField, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  required?: boolean;
}) {
  return (
    <form className="organization-form tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:max-760:grid-cols-[1fr] tw:[align-items:end]" onSubmit={onSubmit}>
      <label>
        <span>Название</span>
        <input
          value={form.name}
          maxLength={255}
          onChange={(event) => onChange("name", event.target.value)}
          required={required}
        />
        <FieldError message={validationErrors.name} />
      </label>
      <label>
        <span>Email</span>
        <input
          type="email"
          value={form.email}
          onChange={(event) => onChange("email", event.target.value)}
          required={required}
        />
        <FieldError message={validationErrors.email} />
      </label>
      <label className="organization-form-wide tw:col-[1_/_-1]">
        <span>Описание</span>
        <textarea
          value={form.description}
          onChange={(event) => onChange("description", event.target.value)}
          required={required}
        />
        <FieldError message={validationErrors.description} />
      </label>
      <div className="organization-form-actions organization-form-wide tw:flex tw:items-center tw:flex-wrap tw:gap-[10px] tw:col-[1_/_-1]">
        <button type="submit" className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
            disabled={isPending}
            onClick={onCancel}
          >
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

function OrganizationDetails({
  organization,
  title = "Организация",
  canUpdateOrganization,
  canDeleteOrganization,
  editForm,
  validationErrors,
  pendingAction,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onEditChange,
  onUpdate,
  onDelete,
  headerActions = null,
}: {
  organization: Organization | null;
  title?: string;
  canUpdateOrganization: boolean;
  canDeleteOrganization: boolean;
  editForm: OrganizationFormValues;
  validationErrors: FieldErrors;
  pendingAction: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (field: FormField, value: string) => void;
  onUpdate: (organizationId: string, form: OrganizationFormValues) => void;
  onDelete: (organizationId: string) => void;
  headerActions?: ReactNode;
}) {
  if (!organization) return null;

  return (
    <article className="glass-card organization-panel tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[24px] tw:grid tw:gap-[18px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
      <div className="organization-panel-head tw:flex tw:items-start tw:justify-between tw:gap-[16px] tw:max-760:flex-col">
        <div>
          <span className="organization-kicker tw:text-(--muted) tw:inline-flex tw:mb-[6px] tw:text-[0.78rem] tw:font-[800] tw:tracking-[0.03em] tw:uppercase">{title}</span>
          <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em]">{organization.name}</h3>
        </div>
        {(headerActions || (canUpdateOrganization && !isEditing)) && (
          <div className="organization-panel-actions tw:flex tw:flex-wrap tw:justify-end tw:gap-[10px] tw:max-760:justify-start">
            {headerActions}
            {canUpdateOrganization && !isEditing && (
              <button
                type="button"
                className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                onClick={onStartEdit}
              >
                Редактировать
              </button>
            )}
          </div>
        )}
      </div>

      <article className="organization-card tw:rounded-[18px] tw:p-[18px] tw:grid tw:gap-[14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[background:rgba(var(--accent-rgb),_0.05)]">
        <OrganizationHeader
          organization={organization}
          isEditing={isEditing && canUpdateOrganization}
          editForm={editForm}
          validationErrors={validationErrors}
          onEditChange={onEditChange}
        />
        {isEditing && canUpdateOrganization ? (
          <label className="organization-inline-field organization-inline-description tw:grid tw:gap-[7px] tw:w-[100%]">
            <span>Описание</span>
            <textarea
              value={editForm.description}
              onChange={(event) =>
                onEditChange("description", event.target.value)
              }
            />
            <FieldError message={validationErrors.description} />
          </label>
        ) : (
          <p className="organization-description tw:text-(--muted) tw:m-[6px_0_0] tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
            {organization.description || "Описание не заполнено."}
          </p>
        )}
        <OrganizationMeta organization={organization} />

        {isEditing && canUpdateOrganization && (
          <div className="organization-form-actions tw:flex tw:items-center tw:flex-wrap tw:gap-[10px]">
            <button
              type="button"
              className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
              disabled={pendingAction === `update:${organization.id}`}
              onClick={() => onUpdate(organization.id, editForm)}
            >
              {pendingAction === `update:${organization.id}`
                ? "Сохраняем..."
                : "Сохранить"}
            </button>
            <button
              type="button"
              className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
              disabled={pendingAction === `update:${organization.id}`}
              onClick={onCancelEdit}
            >
              Отмена
            </button>
          </div>
        )}

        {canDeleteOrganization && organization.is_active && (
          <button
            type="button"
            className="btn btn-outline organization-danger-btn tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(180,_35,_24,_0.34)] tw:font-[700] tw:tracking-[0.01em] tw:text-[#b42318] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[justify-self:start] tw:hover:[transform:translateY(-1px)]"
            disabled={pendingAction === `delete:${organization.id}`}
            onClick={() => onDelete(organization.id)}
          >
            {pendingAction === `delete:${organization.id}`
              ? "Удаляем..."
              : "Деактивировать"}
          </button>
        )}
      </article>
    </article>
  );
}

export interface OrganizationsPageProps {
  canCreateOrganization?: boolean;
  canReadOrganization?: boolean;
  canReadOwnOrganization?: boolean;
  canUpdateOrganization?: boolean;
  canDeleteOrganization?: boolean;
  canInviteToOrganization?: boolean;
}

/** Текущая организация, список всех организаций, создание и приглашения. */
export function OrganizationsPage({
  canCreateOrganization = false,
  canReadOrganization = false,
  canReadOwnOrganization = false,
  canUpdateOrganization = false,
  canDeleteOrganization = false,
  canInviteToOrganization = false,
}: OrganizationsPageProps) {
  const organizationId = useSessionStore((state) => state.organizationId);
  // { organization } — открытое окно приглашения в организацию.
  const [inviteTarget, setInviteTarget] = useState<{
    organization: Pick<Organization, "id" | "name">;
  } | null>(null);
  const [invitationRevision, setInvitationRevision] = useState(0);
  const [activeSection, setActiveSection] = useState<Section>("current");
  const [currentOrganization, setCurrentOrganization] =
    useState<Organization | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [currentLoading, setCurrentLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editForms, setEditForms] = useState<
    Record<string, OrganizationFormValues>
  >({});
  const [editingOrganizationId, setEditingOrganizationId] = useState<
    string | null
  >(null);
  const [validationErrors, setValidationErrors] = useState<FieldErrors>({});
  const [pendingAction, setPendingAction] = useState("");

  const selectedOrganization = useMemo(() => {
    if (!selectedOrganizationId) return null;
    if (currentOrganization?.id === selectedOrganizationId)
      return currentOrganization;
    return (
      organizations.find((item) => item.id === selectedOrganizationId) || null
    );
  }, [currentOrganization, organizations, selectedOrganizationId]);

  const pages = useMemo(
    () =>
      Array.from({ length: Math.max(1, totalPages) }, (_, index) => index + 1),
    [totalPages],
  );

  const applyEditForm = (organization: Organization | null | undefined) => {
    if (!organization?.id) return;
    setEditForms((current) => ({
      ...current,
      [organization.id]: organizationToForm(organization),
    }));
  };

  const loadCurrentOrganization = async () => {
    if (!organizationId) {
      setCurrentOrganization(null);
      return;
    }

    const organizationFromList = organizations.find(
      (organization) => organization.id === organizationId,
    );

    if (organizationFromList) {
      setCurrentOrganization(organizationFromList);
      applyEditForm(organizationFromList);
      if (!selectedOrganizationId) {
        setSelectedOrganizationId(organizationFromList.id);
      }
      return;
    }
    if (!canReadOwnOrganization) {
      return;
    }

    setCurrentLoading(true);
    setError("");

    try {
      const organization = await fetchOrganizationById(organizationId);
      setCurrentOrganization(organization);
      applyEditForm(organization);
      if (!selectedOrganizationId) {
        setSelectedOrganizationId(organization.id);
      }
    } catch (rawLoadError) {
      const loadError = asMutationError(rawLoadError);
      setCurrentOrganization(null);
      setError(
        loadError.userMessage ||
          loadError.message ||
          "Не удалось загрузить текущую организацию.",
      );
    } finally {
      setCurrentLoading(false);
    }
  };

  const loadOrganizations = async ({ silent = false } = {}) => {
    if (!canReadOrganization) {
      setOrganizations([]);
      setTotalPages(1);
      setTotalItems(0);
      return;
    }

    if (!silent) {
      setListLoading(true);
    }
    setError("");

    try {
      const response = await fetchOrganizationsPage({ page, size: pageSize });
      const items = response.items || [];
      setOrganizations(items);
      setTotalPages(response.total_pages || 1);
      setTotalItems(response.total_items || response.total || 0);

      const currentFromList = items.find(
        (organization) => organization.id === organizationId,
      );
      if (currentFromList) {
        setCurrentOrganization(currentFromList);
        if (!selectedOrganizationId) {
          setSelectedOrganizationId(currentFromList.id);
        }
      }
      setEditForms((current) => ({
        ...current,
        ...Object.fromEntries(
          items.map((organization) => [
            organization.id,
            organizationToForm(organization),
          ]),
        ),
      }));
    } catch (rawLoadError) {
      const loadError = asMutationError(rawLoadError);
      setError(
        loadError.userMessage ||
          loadError.message ||
          "Не удалось загрузить организации.",
      );
      setOrganizations([]);
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentOrganization();
  }, [
    organizationId,
    canReadOrganization,
    canReadOwnOrganization,
    organizations,
  ]);

  useEffect(() => {
    loadOrganizations();
  }, [canReadOrganization, page, pageSize]);

  useEffect(() => {
    if (!notice && !error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [notice, error]);

  const updateCreateField = (field: FormField, value: string) => {
    setCreateForm((current) => ({ ...current, [field]: value }));
    setValidationErrors((current) => ({ ...current, [field]: "" }));
  };

  const updateEditField = (
    organizationIdToEdit: string,
    field: FormField,
    value: string,
  ) => {
    setEditForms((current) => ({
      ...current,
      [organizationIdToEdit]: {
        ...(current[organizationIdToEdit] || EMPTY_FORM),
        [field]: value,
      },
    }));
    setValidationErrors((current) => ({ ...current, [field]: "" }));
  };

  const openCurrentOrganization = () => {
    setActiveSection("current");
    setSelectedOrganizationId(
      currentOrganization?.id || organizationId || null,
    );
    setEditingOrganizationId(null);
    setValidationErrors({});
  };

  const openCreateOrganization = () => {
    setActiveSection("create");
    setEditingOrganizationId(null);
    setValidationErrors({});
  };

  const openAllOrganizations = () => {
    if (!canReadOrganization) return;
    setActiveSection("all");
    setSelectedOrganizationId(null);
    setEditingOrganizationId(null);
    setValidationErrors({});
  };

  const openOrganizationDetails = (organization: Organization) => {
    setActiveSection("details");
    setSelectedOrganizationId(organization.id);
    setEditingOrganizationId(null);
    setValidationErrors({});
    applyEditForm(organization);
  };

  const startEditingOrganization = (organization: Organization | null) => {
    applyEditForm(organization);
    setEditingOrganizationId(organization?.id ?? null);
    setValidationErrors({});
  };

  const cancelEditingOrganization = () => {
    if (selectedOrganization) applyEditForm(selectedOrganization);
    if (currentOrganization) applyEditForm(currentOrganization);
    setEditingOrganizationId(null);
    setValidationErrors({});
  };

  const refreshAfterMutation = async (organizationIdToRefresh: string) => {
    if (organizationIdToRefresh === organizationId) {
      await loadCurrentOrganization();
    }
    if (canReadOrganization) {
      await loadOrganizations({ silent: true });
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateOrganization) return;

    setPendingAction("create");
    setError("");
    setNotice("");
    setValidationErrors({});

    try {
      const organization = await createOrganization(createForm);
      setCreateForm(EMPTY_FORM);
      setNotice("Организация создана.");
      if (canReadOrganization && organization?.id) {
        applyEditForm(organization);
        setOrganizations((current) => [
          organization,
          ...current.filter((item) => item.id !== organization.id),
        ]);
        setSelectedOrganizationId(organization.id);
        setActiveSection("details");
        setPage(1);
        await loadOrganizations({ silent: true });
      } else {
        openCurrentOrganization();
      }
    } catch (rawCreateError) {
      const createError = asMutationError(rawCreateError);
      setValidationErrors(createError.validationErrors || {});
      setError(
        createError.userMessage ||
          createError.message ||
          "Не удалось создать организацию.",
      );
    } finally {
      setPendingAction("");
    }
  };

  const handleUpdate = async (
    organizationIdToUpdate: string,
    form: OrganizationFormValues,
  ) => {
    if (!canUpdateOrganization || !organizationIdToUpdate) return;

    setPendingAction(`update:${organizationIdToUpdate}`);
    setError("");
    setNotice("");
    setValidationErrors({});

    try {
      const organization = await updateOrganization(
        organizationIdToUpdate,
        form,
      );
      setNotice("Организация обновлена.");
      setEditingOrganizationId(null);
      if (organization?.id) {
        applyEditForm(organization);
        if (organization.id === organizationId)
          setCurrentOrganization(organization);
        setOrganizations((current) =>
          current.map((item) =>
            item.id === organization.id ? organization : item,
          ),
        );
      }
      await refreshAfterMutation(organizationIdToUpdate);
    } catch (rawUpdateError) {
      const updateError = asMutationError(rawUpdateError);
      setValidationErrors(updateError.validationErrors || {});
      setError(
        updateError.userMessage ||
          updateError.message ||
          "Не удалось обновить организацию.",
      );
    } finally {
      setPendingAction("");
    }
  };

  const handleDelete = async (organizationIdToDelete: string) => {
    if (!canDeleteOrganization || !organizationIdToDelete) return;

    setPendingAction(`delete:${organizationIdToDelete}`);
    setError("");
    setNotice("");

    try {
      await deleteOrganization(organizationIdToDelete);
      setNotice("Организация деактивирована.");
      await refreshAfterMutation(organizationIdToDelete);
    } catch (rawDeleteError) {
      const deleteError = asMutationError(rawDeleteError);
      setError(
        deleteError.userMessage ||
          deleteError.message ||
          "Не удалось удалить организацию.",
      );
    } finally {
      setPendingAction("");
    }
  };

  // Приглашаем только в текущую организацию (из контекста сессии):
  // бэкенд берёт её из токена.
  const renderInviteActions = (organization: Organization | null) => {
    const targetId = organization?.id || organizationId;
    if (!targetId) return null;
    if (!canInviteToOrganization || targetId !== organizationId) return null;
    const target = organization || { id: targetId, name: "" };
    return (
      <button
        type="button"
        className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
        onClick={() => setInviteTarget({ organization: target })}
      >
        Пригласить в организацию
      </button>
    );
  };

  const renderDetails = (organization: Organization | null, title?: string) => (
    <OrganizationDetails
      organization={organization}
      title={title}
      canUpdateOrganization={canUpdateOrganization}
      canDeleteOrganization={canDeleteOrganization}
      editForm={(organization && editForms[organization.id]) || EMPTY_FORM}
      validationErrors={validationErrors}
      pendingAction={pendingAction}
      isEditing={editingOrganizationId === organization?.id}
      onStartEdit={() => startEditingOrganization(organization)}
      onCancelEdit={cancelEditingOrganization}
      onEditChange={(field, value) =>
        updateEditField(organization?.id ?? "", field, value)
      }
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      headerActions={renderInviteActions(organization)}
    />
  );

  return (
    <section className="container section organizations-page tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:grid tw:gap-[22px] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]">
      <SectionTop
        label="Организации"
        title="Управление организациями платформы"
      />
      <p className="courses-catalog-intro tw:max-w-[820px] tw:m-[18px_0_0] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
        По умолчанию отображается организация, в которой состоит текущий
        пользователь. Остальные разделы в дереве появляются только при наличии
        соответствующих permissions.
      </p>

      {(notice || error) && (
        <article
          className={`glass-card organization-message tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[16px_18px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] ${error ? "is-error" : ""}`}
        >
          <p>{error || notice}</p>
        </article>
      )}

      <div className="organizations-layout tw:grid tw:grid-cols-[280px_minmax(0,_1fr)] tw:gap-[22px] tw:max-1100:grid-cols-[1fr] tw:[align-items:start]">
        <aside
          className="glass-card organizations-tree tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:sticky tw:overflow-hidden tw:isolate tw:top-[18px] tw:p-[18px] tw:grid tw:gap-[10px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:max-1100:static tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]"
          aria-label="Дерево организаций"
        >
          <button
            type="button"
            className={`organizations-tree-item tw:w-[100%] tw:border-solid tw:rounded-[14px] tw:text-(--text) tw:text-left tw:cursor-pointer tw:p-[12px] tw:grid tw:gap-[4px] tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.62)] tw:dark:text-(--heading) tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[transition:border-color_0.16s_ease,_background_0.16s_ease,_transform_0.16s_ease] tw:dark:[&.is-active]:border-[rgba(var(--accent-rgb),_0.56)] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.14)] tw:[&.is-active]:[transform:translateY(-1px)] tw:dark:[&.is-active]:[background:rgba(24,_24,_24,_0.75)] ${activeSection === "current" ? "is-active" : ""}`}
            onClick={openCurrentOrganization}
          >
            <span className="tw:font-[800]">Текущая организация</span>
            {currentOrganization?.name && (
              <small className="tw:text-(--muted)">{currentOrganization.name}</small>
            )}
          </button>

          {canCreateOrganization && (
            <button
              type="button"
              className={`organizations-tree-item tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.26)] tw:rounded-[14px] tw:text-(--text) tw:text-left tw:cursor-pointer tw:p-[12px] tw:grid tw:gap-[4px] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.62)] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.62)] tw:[background:rgba(var(--accent-rgb),_0.06)] tw:[font:inherit] tw:[transition:border-color_0.16s_ease,_background_0.16s_ease,_transform_0.16s_ease] tw:dark:[.page_&]:border-[rgba(var(--accent-rgb),_0.56)] tw:hover:[background:rgba(var(--accent-rgb),_0.14)] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.14)] tw:dark:[.page_&]:text-(--heading) tw:hover:[transform:translateY(-1px)] tw:[&.is-active]:[transform:translateY(-1px)] tw:dark:[.page_&]:[background:rgba(24,_24,_24,_0.75)] ${activeSection === "create" ? "is-active" : ""}`}
              onClick={openCreateOrganization}
            >
              <span>Создание организации</span>
            </button>
          )}

          {canReadOrganization && (
            <div className="organizations-tree-group tw:grid tw:gap-[8px]">
              <button
                type="button"
                className={`organizations-tree-item tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.26)] tw:rounded-[14px] tw:text-(--text) tw:text-left tw:cursor-pointer tw:p-[12px] tw:grid tw:gap-[4px] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.62)] tw:dark:border-[rgba(var(--accent-rgb),_0.56)] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.62)] tw:[background:rgba(var(--accent-rgb),_0.06)] tw:dark:text-(--heading) tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[transition:border-color_0.16s_ease,_background_0.16s_ease,_transform_0.16s_ease] tw:dark:hover:border-[rgba(var(--accent-rgb),_0.56)] tw:dark:[&.is-active]:border-[rgba(var(--accent-rgb),_0.56)] tw:hover:[background:rgba(var(--accent-rgb),_0.14)] tw:dark:[background:rgba(24,_24,_24,_0.75)] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.14)] tw:hover:[transform:translateY(-1px)] tw:[&.is-active]:[transform:translateY(-1px)] tw:dark:hover:[background:rgba(24,_24,_24,_0.75)] tw:dark:[&.is-active]:[background:rgba(24,_24,_24,_0.75)] ${activeSection === "all" ? "is-active" : ""}`}
                onClick={openAllOrganizations}
              >
                <span className="tw:font-[800]">Все организации</span>
              </button>
              {(activeSection === "all" || activeSection === "details") &&
                organizations.length > 0 && (
                  <>
                    <div className="organizations-tree-children tw:ml-[12px] tw:pl-[12px] tw:grid tw:gap-[6px] tw:[border-left:1px_solid_rgba(var(--accent-rgb),_0.28)]">
                      {organizations.map((organization) => (
                        <button
                          key={organization.id}
                          type="button"
                          className={`organizations-tree-child tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.26)] tw:rounded-[14px] tw:text-(--text) tw:text-left tw:cursor-pointer tw:p-[9px_10px] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.62)] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.62)] tw:[background:rgba(var(--accent-rgb),_0.06)] tw:[font:inherit] tw:[&&]:text-[0.9rem] tw:[transition:border-color_0.16s_ease,_background_0.16s_ease,_transform_0.16s_ease] tw:dark:[.page_&]:border-[rgba(var(--accent-rgb),_0.56)] tw:hover:[background:rgba(var(--accent-rgb),_0.14)] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.14)] tw:dark:[.page_&]:text-(--heading) tw:hover:[transform:translateY(-1px)] tw:[&.is-active]:[transform:translateY(-1px)] tw:dark:[.page_&]:[background:rgba(24,_24,_24,_0.75)] ${selectedOrganizationId === organization.id ? "is-active" : ""}`}
                          onClick={() => openOrganizationDetails(organization)}
                        >
                          {organization.name}
                        </button>
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="organizations-tree-pagination tw:ml-[24px] tw:flex tw:items-center tw:gap-[8px] tw:text-(--muted) tw:text-[0.82rem] tw:font-[800]">
                        <button
                          type="button"
                          disabled={page <= 1}
                          onClick={() =>
                            setPage((current) => Math.max(1, current - 1))
                          }
                        >
                          Назад
                        </button>
                        <span>
                          {page}/{totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={page >= totalPages}
                          onClick={() =>
                            setPage((current) =>
                              Math.min(totalPages, current + 1),
                            )
                          }
                        >
                          Вперёд
                        </button>
                      </div>
                    )}
                  </>
                )}
            </div>
          )}
        </aside>

        <div className="organizations-content tw:min-w-[0] tw:grid tw:gap-[18px]">
          {activeSection === "current" && (
            <>
              {currentLoading && (
                <article className="glass-card organization-panel tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[24px] tw:grid tw:gap-[18px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                  <p className="organization-muted tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                    Загружаем текущую организацию...
                  </p>
                </article>
              )}
              {!currentLoading &&
                currentOrganization &&
                renderDetails(currentOrganization, "Текущая организация")}
              {!currentLoading && !currentOrganization && !error && (
                <article className="glass-card organization-panel tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[24px] tw:grid tw:gap-[18px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                  <h3>Текущая организация не определена</h3>
                  <p className="organization-muted tw:text-(--muted)">
                    В сессии нет organization_id или данные организации
                    недоступны.
                  </p>
                  {organizationId && renderInviteActions(null) && (
                    <div className="organization-panel-actions tw:flex tw:flex-wrap tw:justify-end tw:gap-[10px] tw:max-760:justify-start">
                      {renderInviteActions(null)}
                    </div>
                  )}
                </article>
              )}
            </>
          )}

          {activeSection === "create" && canCreateOrganization && (
            <article className="glass-card organization-panel tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[24px] tw:grid tw:gap-[18px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
              <div className="organization-panel-head tw:flex tw:items-start tw:justify-between tw:gap-[16px] tw:max-760:flex-col">
                <div>
                  <h3>Создание организации</h3>
                </div>
              </div>
              <OrganizationForm
                form={createForm}
                submitLabel="Создать"
                pendingLabel="Создаём..."
                isPending={pendingAction === "create"}
                validationErrors={validationErrors}
                onChange={updateCreateField}
                onSubmit={handleCreate}
                required
              />
            </article>
          )}

          {activeSection === "details" &&
            selectedOrganization &&
            renderDetails(selectedOrganization, "Организация")}

          {activeSection === "all" && canReadOrganization && (
            <article className="glass-card organization-panel tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[24px] tw:grid tw:gap-[18px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
              <div className="organization-panel-head tw:flex tw:items-start tw:justify-between tw:gap-[16px] tw:max-760:flex-col">
                <div>
                  <span className="organization-kicker tw:text-(--muted) tw:inline-flex tw:mb-[6px] tw:text-[0.78rem] tw:font-[800] tw:tracking-[0.03em] tw:uppercase">organization.read</span>
                  <h3>Все организации</h3>
                </div>
              </div>

              {listLoading && (
                <p className="organization-muted tw:text-(--muted)">Загружаем организации...</p>
              )}
              {!listLoading && organizations.length === 0 && !error && (
                <p className="organization-muted tw:text-(--muted)">
                  Организации пока не найдены.
                </p>
              )}

              {!listLoading && organizations.length > 0 && (
                <div className="organization-list tw:grid tw:gap-[16px]">
                  {organizations.map((organization) => (
                    <article
                      key={organization.id}
                      className="organization-card tw:rounded-[18px] tw:p-[18px] tw:grid tw:gap-[14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[background:rgba(var(--accent-rgb),_0.05)]"
                    >
                      <OrganizationHeader
                        organization={organization}
                        onOpen={openOrganizationDetails}
                      >
                        {canUpdateOrganization && (
                          <button
                            type="button"
                            className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                            onClick={() => {
                              openOrganizationDetails(organization);
                              startEditingOrganization(organization);
                            }}
                          >
                            Редактировать
                          </button>
                        )}
                      </OrganizationHeader>
                      <p className="organization-description tw:text-(--muted) tw:m-[6px_0_0]">
                        {organization.description || "Описание не заполнено."}
                      </p>
                      <OrganizationMeta organization={organization} />
                      {canDeleteOrganization && organization.is_active && (
                        <div className="organization-card-actions-row tw:flex tw:items-center tw:flex-wrap tw:gap-[10px] tw:justify-start">
                          <button
                            type="button"
                            className="btn btn-outline organization-danger-btn tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(180,_35,_24,_0.34)] tw:font-[700] tw:tracking-[0.01em] tw:text-[#b42318] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[justify-self:start] tw:hover:[transform:translateY(-1px)]"
                            disabled={
                              pendingAction === `delete:${organization.id}`
                            }
                            onClick={() => handleDelete(organization.id)}
                          >
                            {pendingAction === `delete:${organization.id}`
                              ? "Удаляем..."
                              : "Деактивировать"}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <nav
                  className="courses-pagination tw:mt-[22px] tw:flex tw:items-center tw:justify-between tw:gap-[14px] tw:text-(--muted) tw:text-[0.94rem]"
                  aria-label="Пагинация организаций"
                >
                  <span>
                    Страница {page} из {totalPages}
                  </span>
                  <div className="courses-pagination-actions tw:flex tw:items-center tw:flex-wrap tw:gap-[8px]">
                    <button
                      type="button"
                      className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                      disabled={page <= 1}
                      onClick={() =>
                        setPage((current) => Math.max(1, current - 1))
                      }
                    >
                      Назад
                    </button>
                    {pages.map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        className={`courses-pagination-page tw:min-w-[38px] tw:h-[38px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[999px] tw:text-(--text) tw:cursor-pointer tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.82)] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.82)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:hover:text-(--heading) tw:[&.is-active]:text-(--heading) tw:[font:inherit] tw:[&&]:font-[800] tw:hover:[background:rgba(var(--accent-rgb),_0.18)] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.18)] ${pageNumber === page ? "is-active" : ""}`}
                        onClick={() => setPage(pageNumber)}
                        aria-current={pageNumber === page ? "page" : undefined}
                      >
                        {pageNumber}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                      disabled={page >= totalPages}
                      onClick={() =>
                        setPage((current) => Math.min(totalPages, current + 1))
                      }
                    >
                      Вперёд
                    </button>
                  </div>
                </nav>
              )}
            </article>
          )}
          {canInviteToOrganization && organizationId && (activeSection === "current" || (activeSection === "details" && selectedOrganization?.id === organizationId)) && (
            <OrganizationInvitations key={organizationId} revision={invitationRevision} />
          )}
        </div>
      </div>

      <InviteDialog
        open={Boolean(inviteTarget)}
        organizationId={inviteTarget?.organization?.id}
        organizationName={inviteTarget?.organization?.name}
        onClose={() => setInviteTarget(null)}
        onSent={() => setInvitationRevision((value) => value + 1)}
      />
    </section>
  );
}
