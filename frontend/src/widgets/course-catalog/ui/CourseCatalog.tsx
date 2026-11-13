import { useState } from 'react';
import { formatCourseLevel } from '@/entities/course';
import { toText } from '@/shared/lib/text';

export interface CatalogCourse {
  id: string;
  title?: string;
  difficulty?: string;
  level?: string;
  tags?: unknown;
  badge?: string;
}

export interface CourseCatalogProps {
  title?: string;
  intro?: string;
  showCreateCta?: boolean;
  emptyMessage?: string;
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

export function CourseCatalog({
  title = 'Рейтинг курсов, созданных в AI Course Lab',
  intro = 'Выбирайте готовые программы по разным темам, смотрите оценки сообщества и начинайте обучение сразу.',
  emptyMessage = 'Курсы пока не найдены.',
  showCreateCta = true,
  coursesData,
  openCourse,
  openCreator,
  canCreateCourse,
  canReadCourse,
  isLoading = false,
  error = '',
  page = 1,
  pageSize = 6,
  totalPages = 1,
  totalItems = 0,
  onPageChange,
}: CourseCatalogProps) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [topic, setTopic] = useState('');
  const levels = [
    ...new Set(
      coursesData
        .map((course) => course.difficulty || course.level)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const topics = [
    ...new Set(
      coursesData.flatMap((course) =>
        Array.isArray(course.tags) ? course.tags.map(toText) : [],
      ),
    ),
  ];
  const filtered = coursesData.filter(
    (course) =>
      (course.title || '')
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) &&
      (!level || (course.difficulty || course.level) === level) &&
      (!topic ||
        (Array.isArray(course.tags) &&
          course.tags.some((tag) => toText(tag) === topic))),
  );
  const hasFilters = Boolean(query || level || topic);
  const filterClass =
    'tw:min-w-0 tw:h-[50px] tw:rounded-[12px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--surface) tw:px-[15px] tw:text-(--text) tw:[font:inherit] tw:text-[14px]';
  const panelClass =
    'tw:rounded-[22px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[24px]';
  const buttonClass =
    'tw:inline-flex tw:min-h-[42px] tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-solid tw:border-(--line) tw:bg-(--surface) tw:px-[18px] tw:py-[10px] tw:text-(--text) tw:cursor-pointer tw:disabled:opacity-40 tw:disabled:cursor-default';
  const startItem = totalItems > 0 ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, totalItems);
  // Keep pagination bounded for a large catalog.
  const visiblePages = Array.from(
    { length: Math.max(1, totalPages) },
    (_, index) => index + 1,
  ).filter(
    (value) =>
      value === 1 || value === totalPages || Math.abs(value - page) <= 1,
  );

  return (
    <section
      className="container section courses-tab tw:relative tw:z-[1] tw:w-full"
      id="courses-tab"
    >
      <h1 className="tw:max-w-[600px] tw:text-[28px]! tw:leading-[1.35] tw:[font-family:Unbounded,sans-serif] tw:max-760:text-[23px]!">
        {title}
      </h1>
      <p className="courses-catalog-intro tw:mt-[18px] tw:mb-0 tw:max-w-[820px] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72]">
        {intro}
      </p>
      <div
        data-help-slot="courses myCourses"
        className="tw:mt-[20px] tw:empty:hidden"
      />
      {canReadCourse && (
        <div className="tw:mt-[28px] tw:mb-[22px]">
          <div
            role="search"
            aria-label="Фильтры курсов на текущей странице"
            className="tw:grid tw:grid-cols-[minmax(0,1fr)_200px_200px] tw:gap-[12px] tw:max-1100:grid-cols-[1fr_1fr] tw:max-760:grid-cols-1"
          >
            <input
              type="search"
              aria-label="Поиск по названию курса на странице"
              placeholder="Поиск по названию курса..."
              className={`${filterClass} tw:max-1100:col-span-full`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label="Уровень курса"
              className={filterClass}
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option value="">Уровень: все</option>
              {levels.map((value) => (
                <option key={value} value={value}>
                  {formatCourseLevel(value)}
                </option>
              ))}
            </select>
            <select
              aria-label="Тема курса"
              className={filterClass}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            >
              <option value="">Тема: все</option>
              {topics.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          {totalPages > 1 && (
            <p className="tw:mt-[8px] tw:mb-0 tw:text-[12px] tw:text-(--muted)">
              Фильтры применяются к текущей странице каталога.
            </p>
          )}
        </div>
      )}
      {!canReadCourse ? (
        <div className={`${panelClass} tw:mt-[28px]`}>
          <h2>Доступ к курсам ограничен</h2>
          <p>
            Обратитесь к администратору организации, чтобы получить доступ к
            просмотру курсов.
          </p>
        </div>
      ) : isLoading ? (
        <div role="status" className={panelClass}>
          Загружаем курсы...
        </div>
      ) : error ? (
        <div role="alert" className={panelClass}>
          {error}
        </div>
      ) : (
        <>
          {filtered.length === 0 ? (
            <div className={panelClass}>
              <p className="tw:mt-0">
                {hasFilters
                  ? 'По выбранным условиям курсы не найдены.'
                  : emptyMessage}
              </p>
              {hasFilters && (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    setQuery('');
                    setLevel('');
                    setTopic('');
                  }}
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            <div className="courses-catalog-grid tw:grid tw:grid-cols-3 tw:gap-[14px] tw:max-1100:grid-cols-2 tw:max-760:grid-cols-1">
              {filtered.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => openCourse(course.id)}
                  className="course-tab-card glass-card tw:flex tw:min-h-[210px] tw:min-w-0 tw:flex-col tw:gap-[16px] tw:rounded-[22px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[22px_20px] tw:text-left tw:text-(--text) tw:[font:inherit] tw:cursor-pointer tw:hover:border-(--contrast) tw:focus-visible:outline-2 tw:focus-visible:outline-(--contrast)"
                >
                  <span className="tw:text-[18px] tw:font-semibold tw:leading-[1.35] tw:[font-family:Unbounded,sans-serif] tw:wrap-anywhere">
                    {course.title}
                  </span>
                  <span className="course-tab-level tw:flex tw:flex-wrap tw:gap-[8px] tw:text-[14px] tw:text-(--muted)">
                    <span>Уровень</span>
                    <span>
                      {formatCourseLevel(course.difficulty || course.level)}
                    </span>
                  </span>
                  {Array.isArray(course.tags) && course.tags.length > 0 && (
                    <span className="course-tab-tags tw:mt-auto tw:flex tw:flex-wrap tw:gap-[8px] tw:[&>span]:rounded-full tw:[&>span]:border tw:[&>span]:border-solid tw:[&>span]:border-(--line-strong) tw:[&>span]:bg-(--surface) tw:[&>span]:px-[10px] tw:[&>span]:py-[5px] tw:[&>span]:text-[12px] tw:[&>span]:text-(--muted)">
                      {course.tags.slice(0, 4).map((tag, index) => (
                        <span key={`${toText(tag)}-${index}`}>
                          {toText(tag)}
                        </span>
                      ))}
                      {course.tags.length > 4 && (
                        <span
                          title={course.tags.slice(4).map(toText).join(', ')}
                        >
                          +{course.tags.length - 4}
                        </span>
                      )}
                    </span>
                  )}
                  {course.badge && (
                    <span className="tw:text-[12px] tw:font-bold tw:text-(--progress-active)">
                      {course.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <nav
              aria-label="Пагинация курсов"
              className="courses-pagination tw:mt-[22px] tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[14px] tw:text-(--muted) tw:text-[14px]"
            >
              <span>
                Показаны {startItem}–{endItem} из {totalItems}
              </span>
              <div className="tw:flex tw:flex-wrap tw:gap-[8px]">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={page <= 1}
                  onClick={() => onPageChange?.(page - 1)}
                >
                  Назад
                </button>
                {visiblePages.map((value, index) => (
                  <span
                    key={value}
                    className="tw:inline-flex tw:items-center tw:gap-[8px]"
                  >
                    {index > 0 && value - visiblePages[index - 1] > 1 && (
                      <span>…</span>
                    )}
                    <button
                      type="button"
                      aria-label={`Страница ${value}`}
                      aria-current={value === page ? 'page' : undefined}
                      className={`${buttonClass} ${value === page ? 'tw:border-(--contrast) tw:bg-(--contrast)! tw:text-(--text-solid)!' : ''}`}
                      onClick={() => onPageChange?.(value)}
                    >
                      {value}
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={page >= totalPages}
                  onClick={() => onPageChange?.(page + 1)}
                >
                  Далее
                </button>
              </div>
            </nav>
          )}
        </>
      )}
      {canCreateCourse && showCreateCta && (
        <aside
          className={`${panelClass} courses-catalog-cta tw:mt-[28px] tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[24px]`}
        >
          <div>
            <p className="tw:mt-0 tw:mb-[10px] tw:text-[12px] tw:font-bold tw:uppercase tw:text-(--eyebrow)">
              Не нашли подходящий курс?
            </p>
            <h2 className="tw:text-[22px]! tw:[font-family:Unbounded,sans-serif]">
              Создайте программу под свою цель
            </h2>
          </div>
          <button
            type="button"
            className={`${buttonClass} tw:border-transparent tw:bg-(--contrast)! tw:text-(--text-solid)!`}
            onClick={openCreator}
          >
            Создать курс
          </button>
        </aside>
      )}
    </section>
  );
}
