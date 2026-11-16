import { useNavigate } from 'react-router-dom';
import { useAppPermissions } from '@/entities/session';

const guides = [
  {
    id: 'home',
    label: 'Платформа',
    title: 'Знакомство с платформой',
    description:
      'Узнайте, как устроено меню, как менять тему и оставлять обратную связь.',
    note: 'Начните отсюда',
    action: 'Открыть знакомство',
    target: '/',
    targetLabel: 'Перейти на главную',
    path: 'm3 10 9-7 9 7v11H3Zm6 11v-8h6v8',
  },
  {
    id: 'creator',
    label: 'Создание курса',
    title: 'Создайте первый курс',
    description:
      'Познакомьтесь с чатом-конструктором: от темы и цели до готовой программы обучения.',
    note: 'Подсказки без запросов к ИИ',
    action: 'Начать знакомство',
    target: '/creator',
    targetLabel: 'Открыть создание курса',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  },
  {
    id: 'learning',
    label: 'Обучение',
    title: 'Разберитесь с уроками',
    description:
      'Посмотрите, как устроены теория, проверочные вопросы и практика. Познакомьтесь с деревом курса.',
    note: 'Теория и задания',
    action: 'Открыть подсказки',
    target: '/my-courses',
    targetLabel: 'Перейти к своим курсам',
    path: 'M5 3h14v18H5Zm0 14h14',
  },
  {
    id: 'dnd',
    label: 'Drag & Drop',
    title: 'Соберите курс из файлов',
    description:
      'Загрузите материалы на холст и объедините их в уроки и модули в Drag & Drop.',
    note: 'Ваши документы',
    action: 'Открыть конструктор',
    target: '/drag-and-drop-course',
    targetLabel: 'Перейти в Drag & Drop',
    path: 'm12 3 10 6-10 6L2 9Zm-10 10 10 6 10-6M2 17l10 6 10-6',
  },
  {
    id: 'courses',
    label: 'Мои курсы',
    title: 'Найдите свои курсы',
    description:
      'Возвращайтесь к созданным курсам и сохранённому прогрессу через отдельный раздел слева.',
    note: 'Всё в одном разделе',
    action: 'Посмотреть раздел',
    target: '/my-courses',
    targetLabel: 'Открыть мои курсы',
    path: 'M4 3h16v18H4Zm5 0v18',
  },
];

export function QuickStartPage() {
  const { canCreateCourse } = useAppPermissions();
  const navigate = useNavigate();
  const button =
    'tw:inline-flex tw:min-h-[46px] tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-solid tw:border-(--line) tw:bg-transparent tw:px-[24px] tw:py-[12px] tw:text-(--text) tw:text-[14px] tw:font-semibold tw:no-underline tw:cursor-pointer tw:focus-visible:outline-2 tw:focus-visible:outline-(--contrast)';
  return (
    <section className="quick-start-page tw:w-full">
      <h1 className="tw:sr-only">Быстрый старт</h1>
      <p className="tw:mt-0 tw:mb-[20px] tw:text-(--muted) tw:leading-[1.7]">
        Выберите, что хотите освоить. Знакомые действия можно повторить в любой
        момент.
      </p>
      <div className="tw:grid tw:grid-cols-2 tw:gap-[16px] tw:max-980:grid-cols-1">
        {guides.map((guide) => (
          <article
            key={guide.id}
            className={`${guide.id === 'home' ? 'tw:col-span-2 tw:max-980:col-span-1' : ''} tw:flex tw:min-h-[240px] tw:flex-col tw:rounded-[24px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[24px]`}
          >
            <div className="tw:flex tw:items-center tw:gap-[14px] tw:text-(--eyebrow)">
              <span className="tw:grid tw:size-[48px] tw:place-items-center tw:rounded-[14px] tw:bg-(--surface)">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 26"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d={guide.path} />
                </svg>
              </span>
              <span className="tw:text-[12px] tw:font-bold tw:uppercase">
                {guide.label}
              </span>
            </div>
            <h2 className="tw:mt-[16px] tw:text-[22px]! tw:leading-[1.4] tw:[font-family:Unbounded,sans-serif]">
              {guide.title}
            </h2>
            <p className="tw:mt-[14px] tw:mb-[20px] tw:text-(--muted) tw:leading-[1.6]">
              {guide.description}
            </p>
            <div className="tw:mt-auto tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[16px]">
              <span className="tw:text-[13px] tw:text-(--muted)">
                {guide.note}
              </span>
              <button
                type="button"
                disabled={
                  ['creator', 'dnd'].includes(guide.id) && !canCreateCourse
                }
                className={`${button} ${guide.id === 'creator' ? 'tw:border-transparent! tw:bg-(--contrast)! tw:text-(--text-solid)!' : ''}`}
                onClick={() => {
                  if (guide.id === 'creator') {
                    void navigate('/quick-start/training?training=creator');
                    return;
                  }
                  if (guide.id === 'learning') {
                    void navigate(
                      '/quick-start/training?training=creator&lesson=1',
                    );
                    return;
                  }
                  const help = guide.id === 'courses' ? 'myCourses' : guide.id;
                  void navigate(`${guide.target}?help=${help}`);
                }}
              >
                {guide.action}
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="tw:mt-[20px] tw:rounded-[16px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--panel-bg) tw:p-[18px] tw:text-[14px] tw:text-(--muted) tw:leading-[1.6]">
        Подсказки можно повторить здесь в любой момент. Они появляются при
        первом знакомстве с разделом. Обучение открывается на самой странице и
        не запускает генерацию.
      </p>
    </section>
  );
}
