import { toText } from '@/shared/lib/text';
// Витрина готовых курсов, созданных пользователями AI Course Lab
import { SectionTop } from '@/shared/ui/section-top';
import { formatCourseLevel } from '@/entities/course';

/** Курс в карточке каталога. */
export interface CatalogCourse {
  id: string;
  title?: string;
  difficulty?: string;
  level?: string;
  tags?: unknown;
}

export interface CoursesPageProps {
  coursesData: CatalogCourse[];
  openCourse: (courseId: string) => void;
  openCreator: () => void;
  canCreateCourse?: boolean;
  canReadCourse?: boolean;
  isLoading?: boolean;
  error?: string;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
}

// В карточке каталога показываем не больше стольких тегов, остальные — счётчиком.
const MAX_CARD_TAGS = 4;

export function CoursesPage({
  coursesData,
  openCourse,
  openCreator,
  canCreateCourse,
  canReadCourse,
  isLoading = false,
  error = '',
  page = 1,
  pageSize = 9,
  totalPages = 1,
  totalItems = 0,
  onPageChange,
}: CoursesPageProps) {
  const catalogCourses = coursesData;

  const pages = Array.from(
    { length: Math.max(1, totalPages) },
    (_, index) => index + 1,
  );
  const startItem = totalItems > 0 ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <section
      className="container section courses-tab tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]"
      id="courses-tab"
    >
      <SectionTop
        label="Готовые курсы"
        title="Рейтинг курсов, созданных в AI Course Lab"
      />
      <p className="courses-catalog-intro tw:max-w-[820px] tw:m-[18px_0_0] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
        Выбирайте готовые программы по разным темам, смотрите оценки сообщества
        и начинайте обучение сразу. Каждый курс собран с помощью AI Course Lab и
        включает теорию, практику и последовательный учебный маршрут.
      </p>
      {!canReadCourse && (
        <aside className="courses-catalog-cta glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:mt-[28px] tw:p-[clamp(24px,_4vw,_42px)] tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:items-center tw:gap-[28px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-1100:grid-cols-[1fr] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_.btn]:min-w-[190px] tw:max-1100:[&_.btn]:w-[fit-content] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
          <div>
            <span>Доступ ограничен</span>
            <h2>Каталог недоступен для вашей роли</h2>
            <p>
              Обратитесь к администратору организации, чтобы получить доступ к
              просмотру курсов.
            </p>
          </div>
        </aside>
      )}

      {canReadCourse && isLoading && (
        <article className="glass-card courses-catalog-cta tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:mt-[28px] tw:p-[clamp(24px,_4vw,_42px)] tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:items-center tw:gap-[28px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-1100:grid-cols-[1fr] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_.btn]:min-w-[190px] tw:max-1100:[&_.btn]:w-[fit-content] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
          <p>Загружаем курсы...</p>
        </article>
      )}

      {canReadCourse && error && (
        <article className="glass-card courses-catalog-cta tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:mt-[28px] tw:p-[clamp(24px,_4vw,_42px)] tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:items-center tw:gap-[28px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-1100:grid-cols-[1fr] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_.btn]:min-w-[190px] tw:max-1100:[&_.btn]:w-[fit-content] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
          <p>{error}</p>
        </article>
      )}

      {canReadCourse && !isLoading && !error && catalogCourses.length === 0 && (
        <article className="glass-card courses-catalog-cta tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:mt-[28px] tw:p-[clamp(24px,_4vw,_42px)] tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:items-center tw:gap-[28px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-1100:grid-cols-[1fr] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_.btn]:min-w-[190px] tw:max-1100:[&_.btn]:w-[fit-content] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
          <p className="tw:m-[12px_0_0] tw:text-(--muted) tw:leading-[1.72] tw:text-[1rem] tw:tracking-[0.012em]">
            Курсы пока не найдены.
          </p>
        </article>
      )}

      {canReadCourse && !isLoading && !error && catalogCourses.length > 0 && (
        <>
          <div className="courses-catalog-grid tw:mt-[24px] tw:grid tw:grid-cols-[repeat(3,_minmax(0,_1fr))] tw:gap-[14px] tw:max-1100:grid-cols-[1fr]">
            {catalogCourses.map((course) => (
              <article
                key={course.id}
                className="course-tab-card glass-card is-clickable tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[24px] tw:flex tw:flex-col tw:cursor-pointer tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:hover:border-[rgba(var(--accent-rgb),_0.82)] tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[.courses-catalog-grid_&]:p-[22px] tw:[.courses-catalog-grid_&]:gap-[12px] tw:[.courses-catalog-grid_&]:min-h-[196px] tw:hover:[&&]:border-(--glass-glow) tw:hover:[&&&]:border-(--glass-glow) tw:hover:[&&&&]:border-(--glass-glow) tw:focus-visible:[outline:2px_solid_rgba(var(--accent-rgb),_0.85)] tw:focus-visible:[outline-offset:3px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[1.05rem] tw:[&_p]:m-[10px_0_14px] tw:[&_p]:text-(--muted) tw:[&_p]:leading-[1.45] tw:[&_strong]:text-(--ink-accent) tw:[&_strong]:text-[0.92rem] tw:[.courses-catalog-grid_&_h3]:m-[0] tw:[.courses-catalog-grid_&_h3]:text-[1.02rem] tw:[.courses-catalog-grid_&_h3]:leading-[1.32] tw:[.courses-catalog-grid_&_h3]:[display:-webkit-box] tw:[.courses-catalog-grid_&_h3]:[-webkit-line-clamp:3] tw:[.courses-catalog-grid_&_h3]:[-webkit-box-orient:vertical] tw:[.courses-catalog-grid_&_h3]:overflow-hidden tw:[.courses-catalog-grid_&_h3]:wrap-anywhere"
                role="button"
                tabIndex={0}
                onClick={() => openCourse(course.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openCourse(course.id);
                  }
                }}
              >
                {/* Описание курса в каталоге не показываем: длинный текст раздувал
                    карточки. Оно есть на странице курса. */}
                <h3 title={course.title}>{course.title}</h3>
                <p className="course-tab-level tw:[.courses-catalog-grid_&]:m-[0] tw:[.courses-catalog-grid_&]:flex tw:[.courses-catalog-grid_&]:items-baseline tw:[.courses-catalog-grid_&]:gap-[8px] tw:[.courses-catalog-grid_&]:text-(--muted) tw:[.courses-catalog-grid_&]:text-[0.88rem] tw:[.courses-catalog-grid_&_strong]:text-(--ink-accent) tw:[.courses-catalog-grid_&_strong]:text-[0.92rem]">
                  <span>Уровень</span>
                  <strong>
                    {formatCourseLevel(course.difficulty || course.level)}
                  </strong>
                </p>
                {Array.isArray(course.tags) && course.tags.length > 0 && (
                  <div
                    className="course-meta-inline course-tab-tags tw:m-[12px_0_14px] tw:flex tw:gap-[8px] tw:flex-wrap tw:[.courses-catalog-grid_&]:m-[auto_0_0] tw:[&_span]:inline-flex tw:[&_span]:p-[4px_10px] tw:[&_span]:rounded-[999px] tw:[&_span]:text-[0.82rem] tw:[&_span]:text-(--ink-accent) tw:[&_span]:[background:rgba(var(--accent-rgb),_0.14)] tw:[&_span]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)]"
                    aria-label="Теги курса"
                  >
                    {course.tags.slice(0, MAX_CARD_TAGS).map((tag) => (
                      <span key={toText(tag)}>{toText(tag)}</span>
                    ))}
                    {course.tags.length > MAX_CARD_TAGS && (
                      <span
                        className="is-more tw:[.course-meta-inline_&]:[background:transparent]"
                        title={course.tags.slice(MAX_CARD_TAGS).join(', ')}
                      >
                        +{course.tags.length - MAX_CARD_TAGS}
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          {totalPages > 1 && (
            <nav
              className="courses-pagination tw:mt-[22px] tw:flex tw:items-center tw:justify-between tw:gap-[14px] tw:text-(--muted) tw:text-[0.94rem]"
              aria-label="Пагинация курсов"
            >
              <span>
                Показаны {startItem}–{endItem} из {totalItems}
              </span>
              <div className="courses-pagination-actions tw:flex tw:items-center tw:flex-wrap tw:gap-[8px]">
                <button
                  type="button"
                  className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                  onClick={() => onPageChange?.(page - 1)}
                  disabled={page <= 1}
                >
                  Назад
                </button>
                {pages.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={`courses-pagination-page tw:min-w-[38px] tw:h-[38px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[999px] tw:text-(--text) tw:cursor-pointer tw:leading-[inherit] tw:font-[800] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.82)] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.82)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:hover:text-(--heading) tw:[&.is-active]:text-(--heading) tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:text-[length:inherit] tw:[font-family:inherit] tw:hover:[background:rgba(var(--accent-rgb),_0.18)] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.18)] ${pageNumber === page ? 'is-active' : ''}`}
                    onClick={() => onPageChange?.(pageNumber)}
                    aria-current={pageNumber === page ? 'page' : undefined}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                  onClick={() => onPageChange?.(page + 1)}
                  disabled={page >= totalPages}
                >
                  Вперёд
                </button>
              </div>
            </nav>
          )}
        </>
      )}
      {canCreateCourse && (
        <aside className="courses-catalog-cta glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:mt-[28px] tw:p-[clamp(24px,_4vw,_42px)] tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:items-center tw:gap-[28px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-1100:grid-cols-[1fr] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_.btn]:min-w-[190px] tw:max-1100:[&_.btn]:w-[fit-content] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
          <div className="tw:max-w-[760px]">
            <span className="tw:text-(--eyebrow) tw:text-[0.78rem] tw:font-[800] tw:tracking-[0.1em] tw:uppercase">
              Не нашли курс под свою цель?
            </span>
            <h2 className="tw:mt-[9px] tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em] tw:[font-family:'Unbounded',_sans-serif]">
              Создайте персональную программу обучения за несколько минут
            </h2>
            <p className="tw:m-[12px_0_0] tw:text-(--muted) tw:leading-[1.72] tw:text-[1rem] tw:tracking-[0.012em]">
              Расскажите ИИ, какой навык хотите освоить, — он подготовит
              структуру, уроки и практические задания под ваш уровень.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:min-w-[190px] tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:max-1100:w-[fit-content] tw:hover:[transform:translateY(-1px)]"
            onClick={openCreator}
          >
            Создать свой курс
          </button>
        </aside>
      )}
    </section>
  );
}
