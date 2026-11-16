// Главная страница с описанием продукта, каталогом треков и механикой генерации
import { SectionTop } from '@/shared/ui/section-top';
import { points, steps, tracks } from '../config/landing';

export interface HomePageProps {
  openCreator: () => void;
  openCourses: () => void;
  canCreateCourse?: boolean;
  canReadCourse?: boolean;
}

export function HomePage({
  openCreator,
  openCourses,
  canCreateCourse = false,
  canReadCourse = false,
}: HomePageProps) {
  return (
    <>
      <section className="container hero tw:relative tw:z-[1] tw:w-[min(1760px,_calc(100%_-_32px))] tw:max-w-[100%] tw:mt-[24px] tw:max-760:mt-[16px] tw:m-[0_auto] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]">
        <div className="hero-grid tw:grid tw:grid-cols-[1.08fr_0.92fr] tw:gap-[24px] tw:max-1100:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:max-760:grid-cols-[1fr]">
          <div className="hero-left glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[30px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:max-760:p-[18px] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::after]:absolute tw:[&::after]:inset-[0] tw:[&::after]:z-[-1] tw:[&::after]:rounded-[inherit] tw:[&::after]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:''] tw:[&::after]:[backdrop-filter:blur(2px)] tw:[&::after]:[-webkit-backdrop-filter:blur(2px)] tw:[&::after]:[filter:url(#glass-distortion)] tw:[&::after]:[-webkit-filter:url('#glass-distortion')] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
            <p className="kicker tw:m-[0] tw:text-[0.78rem] tw:tracking-[0.1em] tw:uppercase tw:text-(--eyebrow) tw:font-[700]">
              ВАША ЦЕЛЬ — ВАШ ПЕРСОНАЛЬНЫЙ КУРС
            </p>
            <h1 className="tw:mt-[14px] tw:text-[clamp(1.9rem,_4.4vw,_3rem)] tw:leading-[1.15] tw:max-w-[26ch] tw:[font-family:'Unbounded',_sans-serif]">
              Освойте нужный навык быстрее с курсом, созданным ИИ для вас
            </h1>
            <p className="lead tw:mt-[16px] tw:text-(--muted) tw:max-w-[68ch]">
              Опишите, чему хотите научиться, — AI Course Lab за несколько минут
              соберёт понятную программу с теорией, практикой, ИИ-помощником и
              контролем прогресса.
            </p>
            <div className="hero-actions tw:mt-[24px] tw:flex tw:flex-wrap tw:gap-[10px]">
              {canCreateCourse && (
                <button
                  type="button"
                  className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                  onClick={openCreator}
                >
                  Сгенерировать курс
                </button>
              )}
              {canReadCourse && (
                <button
                  type="button"
                  className="btn btn-flat tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.72)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.1)] tw:[backdrop-filter:blur(22px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(22px)_saturate(145%)] tw:hover:[transform:translateY(-1px)]"
                  onClick={openCourses}
                >
                  Каталог ИИ-курсов
                </button>
              )}
            </div>
          </div>

          <div className="hero-right glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[30px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:max-760:p-[18px] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::after]:absolute tw:[&::after]:inset-[0] tw:[&::after]:z-[-1] tw:[&::after]:rounded-[inherit] tw:[&::after]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:''] tw:[&::after]:[backdrop-filter:blur(2px)] tw:[&::after]:[-webkit-backdrop-filter:blur(2px)] tw:[&::after]:[filter:url(#glass-distortion)] tw:[&::after]:[-webkit-filter:url('#glass-distortion')] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
            <p className="panel-title tw:m-[0_0_16px] tw:text-[0.8rem] tw:uppercase tw:tracking-[0.08em] tw:text-(--eyebrow) tw:font-[700]">
              Пример сгенерированного курса
            </p>
            <div className="line-item tw:grid tw:grid-cols-[38px_1fr] tw:gap-[12px] tw:p-[14px_0] tw:[align-items:start] tw:[border-top:1px_solid_rgba(206,_195,_178,_0.8)]">
              <span className="tw:text-(--accent) tw:font-[700]">01</span>
              <p className="tw:m-[0] tw:text-(--ink-muted-strong)">
                Основы ИИ и работа с современными моделями
              </p>
            </div>
            <div className="line-item tw:grid tw:grid-cols-[38px_1fr] tw:gap-[12px] tw:p-[14px_0] tw:[align-items:start] tw:[border-top:1px_solid_rgba(206,_195,_178,_0.8)]">
              <span className="tw:text-(--accent) tw:font-[700]">02</span>
              <p className="tw:m-[0] tw:text-(--ink-muted-strong)">
                Промптинг, контроль качества и верификация ответов
              </p>
            </div>
            <div className="line-item tw:grid tw:grid-cols-[38px_1fr] tw:gap-[12px] tw:p-[14px_0] tw:[align-items:start] tw:[border-top:1px_solid_rgba(206,_195,_178,_0.8)]">
              <span className="tw:text-(--accent) tw:font-[700]">03</span>
              <p className="tw:m-[0] tw:text-(--ink-muted-strong)">
                Практика: автоматизация задач и мини-проекты
              </p>
            </div>
            <div className="line-item active tw:grid tw:grid-cols-[38px_1fr] tw:gap-[12px] tw:p-[14px_0] tw:[align-items:start] tw:[border-top:1px_solid_rgba(206,_195,_178,_0.8)]">
              <span className="tw:text-(--accent) tw:font-[700]">04</span>
              <p className="tw:m-[0] tw:text-(--text) tw:font-[700]">
                Итог: персональный AI-workflow для вашей сферы
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container section home-usp tw:relative tw:z-[1] tw:w-[min(1760px,_calc(100%_-_32px))] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:grid tw:grid-cols-[minmax(0,_0.9fr)_minmax(0,_1.1fr)] tw:gap-[28px] tw:items-center tw:max-1100:grid-cols-[1fr] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]">
        <div className="home-usp-copy">
          <p className="kicker tw:m-[0] tw:text-[0.78rem] tw:tracking-[0.1em] tw:uppercase tw:text-(--eyebrow) tw:font-[700] tw:[.home-usp-copy_>_&:last-child]:m-[14px_0_0] tw:[.home-usp-copy_>_&:last-child]:text-(--muted) tw:[.home-usp-copy_>_&:last-child]:max-w-[60ch] tw:[.home-usp-copy_>_&:last-child]:leading-[1.7]">
            НЕ ИЩИТЕ ПОДХОДЯЩИЙ КУРС — СОЗДАЙТЕ СВОЙ
          </p>
          <h2 className="tw:mt-[10px] tw:max-w-[18ch] tw:text-[clamp(1.45rem,_3vw,_2.25rem)] tw:leading-[1.3] tw:[font-family:'Unbounded',_sans-serif]">
            От учебной цели до готового маршрута за несколько минут
          </h2>
          <p className="tw:last:m-[14px_0_0] tw:last:max-w-[60ch] tw:last:text-(--muted) tw:last:leading-[1.7]">
            Обычные курсы рассчитаны на всех сразу. AI Course Lab учитывает ваш
            уровень, задачу и доступное время, а затем перестраивает обучение по
            мере вашего прогресса.
          </p>
        </div>
        <div className="home-usp-grid tw:grid tw:grid-cols-[repeat(3,_minmax(0,_1fr))] tw:gap-[10px] tw:max-760:grid-cols-[1fr]">
          <article className="glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:min-h-[154px] tw:p-[20px] tw:flex tw:flex-col tw:justify-between tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::after]:absolute tw:[&::after]:inset-[0] tw:[&::after]:z-[-1] tw:[&::after]:rounded-[inherit] tw:[&::after]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:''] tw:[&::after]:[backdrop-filter:blur(2px)] tw:[&::after]:[-webkit-backdrop-filter:blur(2px)] tw:[&::after]:[filter:url(#glass-distortion)] tw:[&::after]:[-webkit-filter:url('#glass-distortion')] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
            <strong className="tw:text-(--heading) tw:text-[1.2rem] tw:[font-family:'Unbounded',_sans-serif]">
              5 минут
            </strong>
            <span className="tw:text-(--muted) tw:text-[0.85rem] tw:leading-[1.45]">
              на создание персональной программы
            </span>
          </article>
          <article className="glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:min-h-[154px] tw:p-[20px] tw:flex tw:flex-col tw:justify-between tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::after]:absolute tw:[&::after]:inset-[0] tw:[&::after]:z-[-1] tw:[&::after]:rounded-[inherit] tw:[&::after]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:''] tw:[&::after]:[backdrop-filter:blur(2px)] tw:[&::after]:[-webkit-backdrop-filter:blur(2px)] tw:[&::after]:[filter:url(#glass-distortion)] tw:[&::after]:[-webkit-filter:url('#glass-distortion')] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
            <strong className="tw:text-(--heading) tw:text-[1.2rem] tw:[font-family:'Unbounded',_sans-serif]">
              1 маршрут
            </strong>
            <span className="tw:text-(--muted) tw:text-[0.85rem] tw:leading-[1.45]">
              без лишних тем и случайных материалов
            </span>
          </article>
          <article className="glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:min-h-[154px] tw:p-[20px] tw:flex tw:flex-col tw:justify-between tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::after]:absolute tw:[&::after]:inset-[0] tw:[&::after]:z-[-1] tw:[&::after]:rounded-[inherit] tw:[&::after]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:''] tw:[&::after]:[backdrop-filter:blur(2px)] tw:[&::after]:[-webkit-backdrop-filter:blur(2px)] tw:[&::after]:[filter:url(#glass-distortion)] tw:[&::after]:[-webkit-filter:url('#glass-distortion')] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
            <strong className="tw:text-(--heading) tw:text-[1.2rem] tw:[font-family:'Unbounded',_sans-serif]">
              24/7
            </strong>
            <span className="tw:text-(--muted) tw:text-[0.85rem] tw:leading-[1.45]">
              ИИ-помощник объясняет и помогает практиковаться
            </span>
          </article>
        </div>
      </section>

      <section
        className="container section tw:relative tw:z-[1] tw:w-[min(1760px,_calc(100%_-_32px))] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]"
        id="about"
      >
        <SectionTop label="01" title="Что вы получаете в AI Course Lab" />
        <div className="point-list tw:mt-[22px] tw:grid tw:gap-[14px] tw:grid-cols-[repeat(3,_minmax(0,_1fr))] tw:max-1100:grid-cols-[1fr]">
          {points.map((item) => (
            <article
              key={item}
              className="glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[20px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:max-760:p-[18px] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::after]:absolute tw:[&::after]:inset-[0] tw:[&::after]:z-[-1] tw:[&::after]:rounded-[inherit] tw:[&::after]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:''] tw:[&::after]:[backdrop-filter:blur(2px)] tw:[&::after]:[-webkit-backdrop-filter:blur(2px)] tw:[&::after]:[filter:url(#glass-distortion)] tw:[&::after]:[-webkit-filter:url('#glass-distortion')] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
            >
              <p className="tw:m-[0] tw:text-(--muted)">{item}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="container section tw:relative tw:z-[1] tw:w-[min(1760px,_calc(100%_-_32px))] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]"
        id="tracks"
      >
        <SectionTop label="02" title="Каталог ИИ-курсов" />
        <div className="track-grid tw:mt-[22px] tw:grid tw:gap-[14px] tw:grid-cols-[repeat(4,_minmax(0,_1fr))] tw:max-1100:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:max-760:grid-cols-[1fr]">
          {tracks.map((track) => (
            <article
              key={track.title}
              className="track-card glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[20px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:max-760:p-[18px] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::after]:absolute tw:[&::after]:inset-[0] tw:[&::after]:z-[-1] tw:[&::after]:rounded-[inherit] tw:[&::after]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:''] tw:[&::after]:[backdrop-filter:blur(2px)] tw:[&::after]:[-webkit-backdrop-filter:blur(2px)] tw:[&::after]:[filter:url(#glass-distortion)] tw:[&::after]:[-webkit-filter:url('#glass-distortion')] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
            >
              <h3 className="tw:text-[1rem] tw:leading-[1.3] tw:[font-family:'Unbounded',_sans-serif]">
                {track.title}
              </h3>
              <p className="track-desc tw:mt-[10px] tw:m-[0] tw:text-(--muted) tw:text-[0.92rem]">
                {track.description}
              </p>
              <div className="track-meta tw:mt-[18px] tw:pt-[14px] tw:flex tw:flex-col tw:gap-[6px] tw:[border-top:1px_solid_rgba(206,_195,_178,_0.86)]">
                <span className="tw:text-[0.84rem] tw:text-(--ink-muted-strong) tw:font-[600]">
                  {track.modules}
                </span>
                <span className="tw:text-[0.84rem] tw:text-(--ink-muted-strong) tw:font-[600]">
                  {track.format}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="container section tw:relative tw:z-[1] tw:w-[min(1760px,_calc(100%_-_32px))] tw:max-w-[100%] tw:mt-[64px] tw:m-[0_auto] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]"
        id="flow"
      >
        <SectionTop label="03" title="Как генерируется ваш ИИ-курс" />
        <div className="flow-grid tw:mt-[22px] tw:grid tw:gap-[14px] tw:grid-cols-[repeat(3,_minmax(0,_1fr))] tw:max-1100:grid-cols-[1fr]">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[20px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:max-760:p-[18px] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::after]:absolute tw:[&::after]:inset-[0] tw:[&::after]:z-[-1] tw:[&::after]:rounded-[inherit] tw:[&::after]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:''] tw:[&::after]:[backdrop-filter:blur(2px)] tw:[&::after]:[-webkit-backdrop-filter:blur(2px)] tw:[&::after]:[filter:url(#glass-distortion)] tw:[&::after]:[-webkit-filter:url('#glass-distortion')] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
            >
              <b className="tw:block tw:text-(--accent) tw:mb-[10px]">
                {String(index + 1).padStart(2, '0')}
              </b>
              <h3 className="tw:mb-[10px] tw:text-[1rem] tw:leading-[1.3] tw:[font-family:'Unbounded',_sans-serif]">
                {step.title}
              </h3>
              <p className="tw:m-[0] tw:text-(--muted)">{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      {canCreateCourse && (
        <section
          className="container cta glass-card tw:relative tw:z-[1] tw:w-[min(1760px,_calc(100%_-_32px))] tw:max-w-[100%] tw:mt-[68px] tw:m-[0_auto] tw:mb-[46px] tw:border-solid tw:border-[rgba(var(--accent-soft-rgb),_0.5)] tw:rounded-[24px] tw:overflow-hidden tw:isolate tw:p-[30px_28px] tw:flex tw:justify-between tw:items-center tw:gap-[16px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:max-760:items-start tw:max-760:flex-col tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::after]:absolute tw:[&::after]:inset-[0] tw:[&::after]:z-[-1] tw:[&::after]:rounded-[inherit] tw:[&::after]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:''] tw:[&::after]:[backdrop-filter:blur(2px)] tw:[&::after]:[-webkit-backdrop-filter:blur(2px)] tw:[&::after]:[filter:url(#glass-distortion)] tw:[&::after]:[-webkit-filter:url('#glass-distortion')] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
          id="cta"
        >
          <div>
            <h2 className="tw:text-[clamp(1.4rem,_3vw,_2.1rem)] tw:[font-family:'Unbounded',_sans-serif]">
              Запустите свой ИИ-курс сегодня
            </h2>
            <p className="tw:m-[10px_0_0] tw:text-(--muted)">
              Одна заявка и вы получаете структуру обучения под вашу задачу.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
            onClick={openCreator}
          >
            Старт генерации
          </button>
        </section>
      )}
    </>
  );
}
