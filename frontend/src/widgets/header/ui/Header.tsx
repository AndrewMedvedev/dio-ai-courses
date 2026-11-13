import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/entities/session';
import { useUiLayoutStore } from '@/shared/lib/ui-layout';
import { themedScrollbarClass } from '@/shared/ui/themed-scrollbar';
import { Chevron } from '@/shared/ui/chevron';
import brandLogo from '@/shared/assets/brand-logo.png';

export interface HeaderProps {
  onFeedback?: () => void;
  theme: string;
  toggleTheme: () => void;
  canCreateCourse?: boolean;
  canReadCourse?: boolean;
  collapsed: boolean;
  onToggleNavigation: () => void;
  onLogoClick?: () => void;
  currentCourse?: { id: string; title?: string };
}

function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 22v-3a7 7 0 0 1 14 0v3',
    courses: 'M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Zm0 0v16',
    saved: 'M5 3h14v18H5Zm4 0v8l3-2 3 2V3M8 17h8',
    grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
    plus: 'M12 3v18M3 12h18',
    bolt: 'M13 2 3 14h8l-1 8 11-13h-8Z',
    play: 'M5 4v16M10 5l11 7-11 7Z',
    exit: 'M9 3H4v18h5M9 12h12m-5-5 5 5-5 5',
    sun: 'M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="tw:shrink-0"
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}

export function Header({
  onFeedback,
  theme,
  toggleTheme,
  canCreateCourse,
  canReadCourse,
  collapsed,
  onToggleNavigation,
  onLogoClick,
  currentCourse,
}: HeaderProps) {
  const navigate = useNavigate();
  const accessToken = useSessionStore((state) => state.accessToken);
  const logout = useSessionStore((state) => state.logout);
  const resetHistory = useUiLayoutStore((state) => state.resetRouteHistory);
  const setProfileTab = useUiLayoutStore((state) => state.setActiveProfileTab);
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link tw:relative tw:flex tw:min-h-[54px] tw:items-center tw:gap-[16px] tw:rounded-[16px] tw:px-[16px] tw:text-(--muted) tw:no-underline tw:text-[17px] tw:leading-[1.45] tw:font-semibold tw:hover:bg-(--surface) tw:focus-visible:outline-2 tw:focus-visible:outline-(--contrast) ${isActive ? 'is-active tw:bg-(--surface) tw:text-(--text) tw:before:absolute tw:before:left-0 tw:before:h-[24px] tw:before:w-[3px] tw:before:rounded-full tw:before:bg-(--contrast)' : ''}`;
  const labelClass = collapsed ? 'tw:hidden' : 'tw:max-980:hidden';
  return (
    <>
      <aside
        aria-label="Основная навигация"
        className={`main-navigation tw:border-0 tw:border-r tw:border-solid tw:border-(--line) tw:fixed tw:inset-y-0 tw:left-0 tw:z-40 tw:flex tw:flex-col tw:bg-(--navigation-bg) tw:p-[16px] tw:max-980:w-[76px] tw:max-980:px-[12px] ${collapsed ? 'tw:w-[76px] tw:px-[12px]' : 'tw:w-[272px]'}`}
      >
        <span
          aria-hidden="true"
          className="tw:pointer-events-none tw:absolute tw:top-[65px] tw:inset-x-0 tw:border-0 tw:border-b tw:border-solid tw:border-(--line)"
        />
        <div
          className={`tw:relative tw:flex tw:items-center ${collapsed ? 'tw:h-[88px] tw:flex-col tw:gap-[24px] tw:mb-[16px] tw:max-980:h-[36px] tw:max-980:mb-[26px]' : 'tw:h-[36px] tw:mb-[26px] tw:gap-[10px]'}`}
        >
          <Link
            to="/"
            onClick={onLogoClick}
            data-tip="Главная страница AI Course Lab"
            aria-label="AI Course Lab — главная"
            className={`tw:flex tw:min-w-0 tw:items-center tw:gap-[12px] tw:text-(--heading) tw:no-underline tw:max-980:w-full tw:max-980:justify-center ${collapsed ? 'tw:w-full tw:justify-center' : ''}`}
          >
            <img
              src={brandLogo}
              width="30"
              height="36"
              alt=""
              className="tw:block tw:h-[36px] tw:w-[30px] tw:shrink-0 tw:object-contain"
            />
            <span
              className={`${labelClass} tw:min-w-0 tw:truncate tw:text-[15px] tw:font-bold tw:[font-family:Unbounded,sans-serif]`}
            >
              AI Course Lab
            </span>
          </Link>
          <button
            type="button"
            onClick={onToggleNavigation}
            data-help="toggle-navigation"
            data-tip={
              collapsed
                ? 'Развернуть меню платформы'
                : 'Свернуть меню до значков'
            }
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            className={`tw:grid ${collapsed ? 'tw:size-[28px]' : 'tw:ml-auto tw:size-[32px]'} tw:shrink-0 tw:place-items-center tw:rounded-full tw:border tw:border-solid tw:border-(--line) tw:bg-(--navigation-bg) tw:p-0 tw:leading-none tw:text-(--muted) tw:cursor-pointer tw:max-980:hidden`}
          >
            <Chevron direction={collapsed ? 'right' : 'left'} />
          </button>
        </div>
        <nav
          className={`${themedScrollbarClass} tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-[8px] tw:overflow-y-auto tw:overflow-x-hidden`}
        >
          <NavLink
            to="/quick-start"
            className={navClass}
            aria-label="Быстрый старт"
            data-tip="Быстрый старт: знакомство с платформой и повтор подсказок."
          >
            <NavigationIcon name="bolt" />
            <span className={labelClass}>Быстрый старт</span>
          </NavLink>
          <NavLink
            to={accessToken ? '/profile' : '/login'}
            className={navClass}
            onClick={() => setProfileTab('overview')}
            aria-label={accessToken ? 'Профиль' : 'Войти'}
            data-tip={
              accessToken
                ? 'Профиль: данные аккаунта, аватар и активный курс.'
                : 'Войти в аккаунт AI Course Lab.'
            }
          >
            <NavigationIcon name="profile" />
            <span className={labelClass}>
              {accessToken ? 'Профиль' : 'Войти'}
            </span>
          </NavLink>
          {currentCourse && canReadCourse && (
            <div className="tw:my-[14px] tw:border-0 tw:border-b tw:border-solid tw:border-(--line) tw:pb-[24px]">
              <p
                className={`${labelClass} tw:text-[11px] tw:uppercase tw:text-(--muted) tw:mb-[12px]`}
              >
                Текущий курс
              </p>
              <NavLink
                to={`/course/${currentCourse.id}`}
                aria-label={currentCourse.title}
                data-tip={`Текущий курс: ${currentCourse.title || 'продолжить обучение'}`}
                className={navClass}
              >
                <NavigationIcon name="play" />
                <span
                  className={`${labelClass} tw:min-w-0 tw:line-clamp-3 tw:text-[15px] tw:leading-[1.5] tw:[overflow-wrap:break-word] tw:[text-wrap:pretty]`}
                >
                  {currentCourse.title}
                </span>
              </NavLink>
            </div>
          )}
          {canReadCourse && (
            <NavLink
              to="/courses"
              className={navClass}
              aria-label="Курсы"
              data-tip="Курсы: найдите готовую программу и начните обучение."
            >
              <NavigationIcon name="courses" />
              <span className={labelClass}>Курсы</span>
            </NavLink>
          )}
          {accessToken && (
            <NavLink
              to="/my-courses"
              className={navClass}
              aria-label="Мои курсы"
              data-tip="Мои курсы: созданные программы и сохранённый прогресс обучения."
            >
              <NavigationIcon name="saved" />
              <span className={labelClass}>Мои курсы</span>
            </NavLink>
          )}
          {canCreateCourse && (
            <>
              <NavLink
                to="/drag-and-drop-course"
                className={navClass}
                aria-label="Drag & Drop курс"
                data-tip="Drag & Drop: соберите курс из своих файлов на холсте."
              >
                <NavigationIcon name="grid" />
                <span className={labelClass}>Drag &amp; Drop курс</span>
              </NavLink>
              <NavLink
                to="/creator"
                className={navClass}
                aria-label="Создать курс"
                data-tip="Создать курс: расскажите ИИ, чему хотите научиться."
              >
                <NavigationIcon name="plus" />
                <span className={labelClass}>Создать курс</span>
              </NavLink>
            </>
          )}
        </nav>
        {accessToken && (
          <button
            type="button"
            aria-label="Выйти"
            data-tip="Выйти из аккаунта."
            onClick={() => {
              void logout().then(() => {
                resetHistory('/');
                void navigate('/', { replace: true });
              });
            }}
            className="tw:mt-[24px] tw:flex tw:min-h-[56px] tw:items-center tw:gap-[16px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line) tw:bg-transparent tw:px-[16px] tw:pt-[18px] tw:text-(--muted) tw:text-[17px] tw:[font-family:inherit] tw:cursor-pointer"
          >
            <NavigationIcon name="exit" />
            <span className={labelClass}>Выйти</span>
          </button>
        )}
      </aside>
      <header className="header tw:border-0 tw:border-b tw:border-solid tw:border-(--line) tw:sticky tw:top-0 tw:z-30 tw:flex tw:h-[66px] tw:items-center tw:justify-end tw:gap-[20px] tw:bg-(--navigation-bg) tw:px-[24px] tw:max-760:px-[16px]">
        <button
          type="button"
          onClick={toggleTheme}
          data-help="toggle-theme"
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          aria-label={
            theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'
          }
          className="tw:flex tw:size-[36px] tw:items-center tw:justify-center tw:border-0 tw:bg-transparent tw:text-(--muted) tw:cursor-pointer"
        >
          <NavigationIcon name="sun" />
        </button>
        <button
          type="button"
          onClick={onFeedback}
          data-help="feedback"
          className="tw:min-h-[46px] tw:rounded-full tw:border-0 tw:bg-(--contrast) tw:px-[44px] tw:text-(--text-solid) tw:font-semibold tw:cursor-pointer tw:max-760:px-[20px] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-4 tw:focus-visible:outline-(--contrast)"
        >
          Обратная связь
        </button>
      </header>
    </>
  );
}
