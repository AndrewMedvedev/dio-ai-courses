import { Link, useLocation } from 'react-router-dom';
import { useUiLayoutStore } from '@/shared/lib/ui-layout';

interface Titled {
  id?: string | null;
  title?: string;
}

export interface BreadcrumbsProps {
  selectedCourse?: Titled | null;
  selectedBlock?: Titled | null;
  selectedLesson?: Titled | null;
  selectedPractice?: Titled | null;
}

const staticRoutes: Record<string, string> = {
  courses: 'Курсы',
  'my-courses': 'Мои курсы',
  'quick-start': 'Быстрый старт',
  creator: 'Создание курса',
  'drag-and-drop-course': 'Drag & Drop курс',
  profile: 'Личный кабинет',
  login: 'Вход',
  register: 'Регистрация',
};

export function Breadcrumbs({
  selectedCourse,
  selectedBlock,
  selectedLesson,
  selectedPractice,
}: BreadcrumbsProps) {
  const location = useLocation();
  const routeHistory = useUiLayoutStore((state) => state.routeHistory);
  const segments = location.pathname.split('/').filter(Boolean);
  const currentRoute = `${location.pathname}${location.search || ''}${location.hash || ''}`;
  const previousRoute = [...routeHistory]
    .reverse()
    .find(
      (route) =>
        route !== currentRoute && route !== '/login' && route !== '/register',
    );

  if (
    segments.length === 0 ||
    [
      '/courses',
      '/my-courses',
      '/quick-start',
      '/profile',
      '/creator',
      '/drag-and-drop-course',
    ].includes(location.pathname)
  ) {
    return null;
  }

  const crumbs: Array<{ label: string; to: string }> = [
    ...(segments[0] === 'course' ? [] : [{ label: 'Главная', to: '/' }]),
  ];

  if (segments[0] !== 'course') {
    crumbs.push({
      label: staticRoutes[segments[0]] || 'Раздел',
      to: location.pathname,
    });
  } else {
    const courseId = segments[1];
    const currentCourse =
      selectedCourse?.id === courseId ? selectedCourse : null;
    const mode =
      segments[2] === 'edit' || segments[2] === 'metrics' ? segments[2] : '';
    const contentTypeIndex = mode ? 3 : 2;
    const contentType = segments[contentTypeIndex];
    const contentId = segments[contentTypeIndex + 1];
    const courseRoute = courseId ? `/course/${courseId}` : location.pathname;
    const modeRoute = mode && courseId ? `${courseRoute}/${mode}` : '';

    crumbs.push({ label: 'Курсы', to: '/courses' });
    crumbs.push({
      label: currentCourse?.title || 'Курс',
      to: mode === 'edit' ? modeRoute : courseRoute,
    });

    if (mode === 'metrics') {
      crumbs.push({ label: 'Метрики', to: modeRoute });
    }

    if (contentType === 'block') {
      crumbs.push({
        label:
          selectedBlock?.id === contentId
            ? selectedBlock.title || 'Модуль'
            : 'Модуль',
        to: location.pathname,
      });
    }

    if (contentType === 'lesson' || contentType === 'lessons') {
      crumbs.push({
        label:
          selectedLesson?.id === contentId
            ? selectedLesson.title || 'Урок'
            : 'Урок',
        to: location.pathname,
      });
    }

    if (contentType === 'practice') {
      crumbs.push({
        label:
          selectedPractice?.id === contentId
            ? selectedPractice.title || 'Практика'
            : 'Практика',
        to: location.pathname,
      });
    }
  }

  return (
    <nav
      className="container breadcrumbs tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-0 tw:m-[0_auto] tw:mb-[24px] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:[&_a]:text-(--eyebrow) tw:[&_a]:[text-decoration:none] tw:[&_a:hover]:underline"
      aria-label="Хлебные крошки"
    >
      <ol className="tw:m-[0] tw:p-[0] tw:flex tw:items-center tw:flex-wrap tw:gap-[7px] tw:[list-style:none]">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li
              className="tw:inline-flex tw:min-w-0 tw:max-w-full tw:items-start tw:gap-[9px] tw:[overflow-wrap:anywhere] tw:text-(--eyebrow) tw:text-[17px]! tw:leading-[1.72] tw:tracking-[0.012em] tw:[.breadcrumbs_li_+_&]:[&::before]:text-[rgba(var(--accent-rgb),_0.8)] tw:[.breadcrumbs_li_+_&]:[&::before]:font-[800] tw:[.breadcrumbs_li_+_&]:[&::before]:shrink-0 tw:[.breadcrumbs_li_+_&]:[&::before]:[content:'›']"
              key={`${crumb.to}-${crumb.label}`}
            >
              {isLast ? (
                <span aria-current="page">{crumb.label}</span>
              ) : (
                <Link to={crumb.to} replace={crumb.to === previousRoute}>
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
