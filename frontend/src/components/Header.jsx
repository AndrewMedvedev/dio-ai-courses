// Шапка приложения и навигация по маршрутам
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuthenticatedImage } from "../hooks/useAuthenticatedImage";
import { useSessionStore } from "../stores/sessionStore";

export default function Header({
  theme,
  toggleTheme,
  canCreateCourse = false,
  canReadCourse = false,
  canManageOrganizations = false,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const accessToken = useSessionStore((state) => state.accessToken);
  const refreshToken = useSessionStore((state) => state.refreshToken);
  const identity = useSessionStore((state) => state.identity);
  const user = useSessionStore((state) => state.user);
  const logout = useSessionStore((state) => state.logout);
  const isAuthenticated = Boolean(accessToken && refreshToken);
  const { imageUrl: avatarImageUrl } = useAuthenticatedImage(user?.avatar_url, {
    enabled: isAuthenticated,
  });
  const isCoursePath =
    location.pathname.startsWith("/course") || location.pathname === "/courses";
  const isOrganizationsPath = location.pathname.startsWith("/organizations");

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };
  const displayName = user?.username || identity?.email || "Профиль";

  return (
    <header className="container header">
      <Link to="/" className="logo logo-button">
        <span className="logo-main">AI Course Lab</span>
        <span className="logo-sub">обучение, созданное под вас</span>
      </Link>

      <nav className="nav">
        {canReadCourse && (
          <NavLink
            to="/courses"
            className={({ isActive }) =>
              `nav-link ${isCoursePath ? "is-active" : ""}`
            }
          >
            Каталог
          </NavLink>
        )}
        {canManageOrganizations && (
          <NavLink
            to="/organizations"
            className={() =>
              `nav-link ${isOrganizationsPath ? "is-active" : ""}`
            }
          >
            Организации
          </NavLink>
        )}
        {canCreateCourse && (
          <>
            <NavLink
              to="/creator"
              className={({ isActive }) =>
                `nav-link ${isActive ? "is-active" : ""}`
              }
            >
              Создать курс
            </NavLink>
            <NavLink
              to="/manual-course-builder"
              className={({ isActive }) =>
                `nav-link ${isActive ? "is-active" : ""}`
              }
            >
              Создать курс самостоятельно
            </NavLink>
          </>
        )}
      </nav>

      <div className="header-actions">
        {isAuthenticated ? (
          <>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `profile-chip glass-card ${isActive ? "is-active" : ""}`
              }
            >
              {avatarImageUrl ? (
                <img
                  className="profile-avatar profile-avatar-image"
                  src={avatarImageUrl}
                  alt="Аватар пользователя"
                />
              ) : (
                <span
                  className="profile-avatar profile-avatar-placeholder"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-3.31 0-6 1.79-6 4v1h12v-1c0-2.21-2.69-4-6-4Z" />
                  </svg>
                </span>
              )}
              <span className="profile-label">{displayName}</span>
            </NavLink>
            <button
              type="button"
              className="btn btn-ghost header-logout"
              onClick={handleLogout}
            >
              Выйти
            </button>
          </>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) =>
              `profile-chip glass-card ${isActive ? "is-active" : ""}`
            }
          >
            <span className="profile-avatar">→</span>
            <span className="profile-label">Войти</span>
          </NavLink>
        )}
        <label
          className="theme-switch glass-card"
          title={
            theme === "dark"
              ? "Переключить на светлую тему"
              : "Переключить на темную тему"
          }
        >
          <input
            type="checkbox"
            checked={theme === "dark"}
            onChange={toggleTheme}
            aria-label={
              theme === "dark"
                ? "Переключить на светлую тему"
                : "Переключить на темную тему"
            }
          />
          <span className="theme-switch-track" aria-hidden="true">
            <span>☀</span>
            <span>☾</span>
            <i />
          </span>
        </label>
      </div>
    </header>
  );
}
