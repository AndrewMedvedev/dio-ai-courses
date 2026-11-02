// Шапка приложения и навигация по маршрутам
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import { useUiLayoutStore } from "@/shared/lib/ui-layout";
import { getMediaUrl, MEDIA_FOLDERS } from "@/shared/lib/media";

export interface HeaderProps {
  theme: string;
  toggleTheme: () => void;
  canCreateCourse?: boolean;
  canReadCourse?: boolean;
  canManageOrganizations?: boolean;
  canManageModels?: boolean;
}

function getDisplayText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  return getDisplayText(
    record.value ||
      record.label ||
      record.name ||
      record.email ||
      record.username,
  );
}

export function Header({
  theme,
  toggleTheme,
  canCreateCourse = false,
  canReadCourse = false,
  canManageOrganizations = false,
  canManageModels = false,
}: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const accessToken = useSessionStore((state) => state.accessToken);

  const identity = useSessionStore((state) => state.identity);
  const user = useSessionStore((state) => state.user);
  const logout = useSessionStore((state) => state.logout);
  const resetRouteHistory = useUiLayoutStore(
    (state) => state.resetRouteHistory,
  );
  const isAuthenticated = Boolean(accessToken);
  const currentUserId = user?.id || user?.user_id || user?.userId;
  const avatarImageUrl = getMediaUrl(
    currentUserId,
    MEDIA_FOLDERS.AVATAR,
    user?.avatar_url,
  );
  const isCoursePath =
    location.pathname.startsWith("/course") || location.pathname === "/courses";
  const isOrganizationsPath = location.pathname.startsWith("/organizations");
  const isModelsPath = location.pathname.startsWith("/models");

  const handleLogout = async () => {
    await logout();
    resetRouteHistory("/");
    navigate("/", { replace: true });
  };
  const displayName =
    getDisplayText(user?.username) ||
    getDisplayText(user?.name) ||
    getDisplayText(identity?.email) ||
    getDisplayText(identity?.username) ||
    "Профиль";

  return (
    <header className="container header tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:m-[0_auto] tw:p-[30px_0_34px] tw:grid tw:grid-cols-[minmax(190px,_auto)_minmax(0,_1fr)_auto] tw:items-center tw:gap-[14px] tw:max-760:flex tw:max-980:grid-cols-[1fr_auto] tw:max-760:flex-wrap tw:max-980:[align-items:start] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]">
      <Link
        to="/"
        className="logo logo-button tw:inline-flex tw:flex-col tw:p-[0] tw:text-left tw:cursor-pointer tw:[justify-self:start] tw:[text-decoration:none] tw:[border:0] tw:[background:transparent]"
      >
        <span className="logo-main tw:text-[clamp(1rem,_1.25vw,_1.2rem)] tw:text-(--text) tw:whitespace-nowrap tw:[font-family:'Unbounded',_sans-serif]">
          AI Course Lab
        </span>
        <span className="logo-sub tw:mt-[4px] tw:text-[clamp(0.62rem,_0.75vw,_0.74rem)] tw:tracking-[0.06em] tw:uppercase tw:text-(--muted) tw:whitespace-nowrap">
          обучение, созданное под вас
        </span>
      </Link>

      <nav className="nav tw:justify-self-center tw:min-w-[0] tw:max-w-[100%] tw:flex tw:items-center tw:justify-center tw:flex-nowrap tw:gap-[6px] tw:overflow-hidden tw:max-980:justify-self-stretch tw:max-980:justify-start tw:max-980:flex-wrap tw:max-760:gap-[8px] tw:max-980:overflow-visible tw:max-980:col-[1_/_-1] tw:max-980:row-[2] tw:max-760:w-[100%] tw:max-760:text-[0.9rem] tw:max-760:[order:3]">
        {canReadCourse && (
          <NavLink
            to="/courses"
            className={() =>
              `nav-link tw:text-(--muted) tw:min-h-[34px] tw:border-solid tw:border-[transparent] tw:rounded-[999px] tw:text-[clamp(0.76rem,_0.9vw,_0.94rem)] tw:font-[700] tw:leading-[1.2] tw:cursor-pointer tw:p-[6px_8px] tw:inline-flex tw:items-center tw:justify-center tw:whitespace-nowrap tw:[&.is-active]:text-(--accent) tw:hover:text-(--accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.32)] tw:[background:transparent] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:max-760:p-[7px_9px] tw:[transition:background_0.16s_ease,_border-color_0.16s_ease,_color_0.16s_ease] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.1)] ${isCoursePath ? "is-active" : ""}`
            }
          >
            Каталог
          </NavLink>
        )}
        {canManageOrganizations && (
          <NavLink
            to="/organizations"
            className={() =>
              `nav-link tw:text-(--muted) tw:min-h-[34px] tw:border-solid tw:border-[transparent] tw:rounded-[999px] tw:text-[clamp(0.76rem,_0.9vw,_0.94rem)] tw:font-[700] tw:leading-[1.2] tw:cursor-pointer tw:p-[6px_8px] tw:inline-flex tw:items-center tw:justify-center tw:whitespace-nowrap tw:hover:text-(--accent) tw:[&.is-active]:text-(--accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.32)] tw:[background:transparent] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:max-760:p-[7px_9px] tw:[transition:background_0.16s_ease,_border-color_0.16s_ease,_color_0.16s_ease] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.1)] ${isOrganizationsPath ? "is-active" : ""}`
            }
          >
            Организации
          </NavLink>
        )}
        {canManageModels && (
          <NavLink
            to="/models"
            className={() =>
              `nav-link tw:text-(--muted) tw:min-h-[34px] tw:border-solid tw:border-[transparent] tw:rounded-[999px] tw:text-[clamp(0.76rem,_0.9vw,_0.94rem)] tw:font-[700] tw:leading-[1.2] tw:cursor-pointer tw:p-[6px_8px] tw:inline-flex tw:items-center tw:justify-center tw:whitespace-nowrap tw:hover:text-(--accent) tw:[&.is-active]:text-(--accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.32)] tw:[background:transparent] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:max-760:p-[7px_9px] tw:[transition:background_0.16s_ease,_border-color_0.16s_ease,_color_0.16s_ease] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.1)] ${isModelsPath ? "is-active" : ""}`
            }
          >
            AI-модели
          </NavLink>
        )}
        {canCreateCourse && (
          <>
            <NavLink
              to="/creator"
              className={({ isActive }) =>
                `nav-link tw:text-(--muted) tw:min-h-[34px] tw:border-solid tw:border-[transparent] tw:rounded-[999px] tw:text-[clamp(0.76rem,_0.9vw,_0.94rem)] tw:font-[700] tw:leading-[1.2] tw:cursor-pointer tw:p-[6px_8px] tw:inline-flex tw:items-center tw:justify-center tw:whitespace-nowrap tw:hover:text-(--accent) tw:[&.is-active]:text-(--accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.32)] tw:[background:transparent] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:max-760:p-[7px_9px] tw:[transition:background_0.16s_ease,_border-color_0.16s_ease,_color_0.16s_ease] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.1)] ${isActive ? "is-active" : ""}`
              }
            >
              Создать курс
            </NavLink>
            <NavLink
              to="/drag-and-drop-course"
              className={({ isActive }) =>
                `nav-link tw:text-(--muted) tw:min-h-[34px] tw:border-solid tw:border-[transparent] tw:rounded-[999px] tw:text-[clamp(0.76rem,_0.9vw,_0.94rem)] tw:font-[700] tw:leading-[1.2] tw:cursor-pointer tw:p-[6px_8px] tw:inline-flex tw:items-center tw:justify-center tw:whitespace-nowrap tw:hover:text-(--accent) tw:[&.is-active]:text-(--accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.32)] tw:[background:transparent] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:max-760:p-[7px_9px] tw:[transition:background_0.16s_ease,_border-color_0.16s_ease,_color_0.16s_ease] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.1)] ${isActive ? "is-active" : ""}`
              }
            >
              Drag &amp; Drop курс
            </NavLink>
          </>
        )}
      </nav>

      <div className="header-actions tw:inline-flex tw:items-center tw:gap-[8px] tw:shrink-0 tw:whitespace-nowrap tw:[justify-self:end] tw:max-760:w-[100%] tw:max-760:justify-between tw:max-760:ml-[0]">
        {isAuthenticated ? (
          <>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `profile-chip glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:inline-flex tw:items-center tw:gap-[10px] tw:p-[8px_12px] tw:cursor-pointer tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.82)] tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[text-decoration:none] tw:hover:[&.is-active]:border-(--glass-glow) tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] ${isActive ? "is-active" : ""}`
              }
            >
              {avatarImageUrl ? (
                <img
                  className="profile-avatar profile-avatar-image tw:w-[30px] tw:h-[30px] tw:rounded-[50%] tw:inline-flex tw:items-center tw:justify-center tw:text-(--ink-accent) tw:flex-[0_0_auto] tw:overflow-hidden tw:object-cover tw:[background:rgba(var(--accent-rgb),_0.18)]"
                  src={avatarImageUrl}
                  alt="Аватар пользователя"
                />
              ) : (
                <span
                  className="profile-avatar profile-avatar-placeholder tw:w-[30px] tw:h-[30px] tw:rounded-[50%] tw:inline-flex tw:items-center tw:justify-center tw:text-(--ink-accent) tw:flex-[0_0_auto] tw:overflow-hidden tw:[background:rgba(var(--accent-rgb),_0.18)]"
                  aria-hidden="true"
                >
                  <svg
                    className="tw:w-[18px] tw:h-[18px] tw:fill-[currentColor]"
                    viewBox="0 0 24 24"
                    focusable="false"
                  >
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-3.31 0-6 1.79-6 4v1h12v-1c0-2.21-2.69-4-6-4Z" />
                  </svg>
                </span>
              )}
              <span className="profile-label tw:text-[0.9rem] tw:text-(--text)">
                {displayName}
              </span>
            </NavLink>
            <button
              type="button"
              className="btn btn-ghost header-logout tw:min-h-[42px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:font-[700] tw:tracking-[0.01em] tw:[text-decoration:none] tw:[border:1px_solid_transparent] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:hover:[transform:translateY(-1px)]"
              onClick={handleLogout}
            >
              Выйти
            </button>
          </>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) =>
              `profile-chip glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:inline-flex tw:items-center tw:gap-[10px] tw:p-[8px_12px] tw:cursor-pointer tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.82)] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[text-decoration:none] tw:hover:[&.is-active]:border-(--glass-glow) tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] ${isActive ? "is-active" : ""}`
            }
          >
            <span className="profile-avatar tw:w-[30px] tw:h-[30px] tw:rounded-[50%] tw:inline-flex tw:items-center tw:justify-center tw:text-(--ink-accent) tw:flex-[0_0_auto] tw:overflow-hidden tw:[background:rgba(var(--accent-rgb),_0.18)]">
              →
            </span>
            <span className="profile-label tw:text-[0.9rem] tw:text-(--text)">
              Войти
            </span>
          </NavLink>
        )}
        <label
          className="theme-switch glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[999px] tw:relative tw:overflow-hidden tw:isolate tw:w-[80px] tw:h-[44px] tw:min-w-[80px] tw:p-[4px] tw:cursor-pointer tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[order:4] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
          title={
            theme === "dark"
              ? "Переключить на светлую тему"
              : "Переключить на темную тему"
          }
        >
          <input
            className="tw:w-[1px] tw:h-[1px] tw:opacity-[0] tw:pointer-events-none tw:[&&&]:absolute"
            type="checkbox"
            checked={theme === "dark"}
            onChange={toggleTheme}
            aria-label={
              theme === "dark"
                ? "Переключить на светлую тему"
                : "Переключить на темную тему"
            }
          />
          <span
            className="theme-switch-track tw:relative tw:w-[100%] tw:h-[100%] tw:rounded-[inherit] tw:grid tw:grid-cols-[1fr_1fr] tw:items-center tw:text-(--heading) tw:text-[0.95rem] tw:leading-[1] tw:[justify-items:center] tw:[background:rgba(var(--accent-rgb),_0.12)] tw:[.theme-switch_input:focus-visible_+_&]:[outline:3px_solid_rgba(var(--accent-rgb),_0.25)] tw:[.theme-switch_input:focus-visible_+_&]:[outline-offset:3px]"
            aria-hidden="true"
          >
            <span className="tw:relative tw:z-[1]">☀</span>
            <span className="tw:relative tw:z-[1]">☾</span>
            <i className="tw:absolute tw:z-[0] tw:top-[3px] tw:left-[3px] tw:w-[28px] tw:h-[28px] tw:rounded-[50%] tw:[background:var(--surface)] tw:[box-shadow:0_2px_8px_rgba(24,_24,_24,_0.2)] tw:[transition:transform_180ms_ease] tw:[.theme-switch_input:checked_+_.theme-switch-track_&]:[transform:translateX(36px)]" />
          </span>
        </label>
      </div>
    </header>
  );
}
