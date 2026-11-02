// Полноценный футер с навигацией по продукту и служебными ссылками
import { Link } from "react-router-dom";

export interface FooterProps {
  canCreateCourse?: boolean;
  canReadCourse?: boolean;
}

export function Footer({
  canCreateCourse = false,
  canReadCourse = false,
}: FooterProps) {
  return (
    <footer className="footer-shell tw:relative tw:z-[1] tw:mt-[64px] tw:[border-top:1px_solid_rgba(var(--accent-rgb),_0.26)] tw:[background:rgba(255,_255,_255,_0.1)]">
      <div className="container footer tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:m-[0_auto] tw:p-[42px_0_34px] tw:grid tw:grid-cols-[minmax(240px,_1.5fr)_repeat(3,_minmax(140px,_0.7fr))] tw:gap-[36px] tw:text-(--footer-text) tw:text-[0.92rem] tw:max-1100:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:max-760:grid-cols-[1fr] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:[&_a]:text-(--muted) tw:[&_a]:[text-decoration:none] tw:[&_a:hover]:text-(--accent)">
        <div className="footer-brand">
          <Link to="/" className="logo tw:inline-flex tw:flex-col">
            <span className="logo-main tw:text-[clamp(1rem,_1.25vw,_1.2rem)] tw:text-(--text) tw:whitespace-nowrap tw:[font-family:'Unbounded',_sans-serif]">
              AI Course Lab
            </span>
            <span className="logo-sub tw:mt-[4px] tw:text-[clamp(0.62rem,_0.75vw,_0.74rem)] tw:tracking-[0.06em] tw:uppercase tw:text-(--muted) tw:whitespace-nowrap">
              обучение, созданное под вас
            </span>
          </Link>
          <p className="tw:max-w-[390px] tw:m-[16px_0_0] tw:text-(--muted) tw:leading-[1.65]">
            Персональные курсы с теорией, практикой и ИИ-помощником под вашу
            цель и уровень.
          </p>
        </div>
        <div className="footer-column tw:flex tw:flex-col tw:items-start tw:gap-[11px] tw:[&_a]:text-(--muted) tw:[&_a]:[text-decoration:none]">
          <strong className="tw:mb-[3px] tw:text-(--heading) tw:text-[0.82rem] tw:[font-family:'Unbounded',_sans-serif]">
            Продукт
          </strong>
          {canReadCourse && <Link to="/courses">Каталог курсов</Link>}
          {canCreateCourse && <Link to="/creator">Создать курс</Link>}
        </div>
        <div className="footer-column tw:flex tw:flex-col tw:items-start tw:gap-[11px] tw:[&_a]:text-(--muted) tw:[&_a]:[text-decoration:none]">
          <strong className="tw:mb-[3px] tw:text-(--heading) tw:text-[0.82rem] tw:[font-family:'Unbounded',_sans-serif]">
            Аккаунт
          </strong>
          <Link to="/profile">Личный кабинет</Link>
          <Link to="/login">Войти</Link>
          <Link to="/register">Регистрация</Link>
        </div>
        <div className="footer-column tw:flex tw:flex-col tw:items-start tw:gap-[11px] tw:[&_a]:text-(--muted) tw:[&_a]:[text-decoration:none]">
          <strong className="tw:mb-[3px] tw:text-(--heading) tw:text-[0.82rem] tw:[font-family:'Unbounded',_sans-serif]">
            Поддержка
          </strong>
          <a href="mailto:support@aicourselab.ru">Связаться с нами</a>
          <a href="#privacy">Политика конфиденциальности</a>
          <a href="#terms">Условия использования</a>
        </div>
      </div>
      <div className="container footer-bottom tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:m-[0_auto] tw:p-[16px_0_28px] tw:flex tw:justify-between tw:gap-[16px] tw:text-(--muted) tw:text-[0.76rem] tw:[border-top:1px_solid_rgba(var(--accent-rgb),_0.2)] tw:max-760:flex-col tw:max-760:items-start tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]">
        <span>© 2026 AI Course Lab</span>
        <span>Курсы нового поколения</span>
      </div>
    </footer>
  );
}
