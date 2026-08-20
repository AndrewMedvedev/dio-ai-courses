import { Link, useLocation } from "react-router-dom";

const staticRoutes = {
  courses: "Каталог",
  creator: "Создание курса",
  "manual-course-builder": "Создать курс самостоятельно",
  profile: "Личный кабинет",
  login: "Вход",
  register: "Регистрация",
};

export default function Breadcrumbs({
  selectedCourse,
  selectedBlock,
  selectedLesson,
  selectedPractice,
}) {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const crumbs = [{ label: "Главная", to: "/" }];

  if (segments[0] !== "course") {
    crumbs.push({
      label: staticRoutes[segments[0]] || "Раздел",
      to: location.pathname,
    });
  } else {
    crumbs.push({ label: "Каталог", to: "/courses" });
    crumbs.push({
      label: selectedCourse?.title || "Курс",
      to: selectedCourse ? `/course/${selectedCourse.id}` : location.pathname,
    });

    if (segments[2] === "block" && selectedBlock) {
      crumbs.push({ label: selectedBlock.title, to: location.pathname });
    }

    if (segments[2] === "lesson" && selectedLesson) {
      crumbs.push({ label: selectedLesson.title, to: location.pathname });
    }

    if (segments[2] === "practice" && selectedPractice) {
      crumbs.push({ label: selectedPractice.title, to: location.pathname });
    }
  }

  return (
    <nav className="container breadcrumbs" aria-label="Хлебные крошки">
      <ol>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.to}-${crumb.label}`}>
              {isLast ? (
                <span aria-current="page">{crumb.label}</span>
              ) : (
                <Link to={crumb.to}>{crumb.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
