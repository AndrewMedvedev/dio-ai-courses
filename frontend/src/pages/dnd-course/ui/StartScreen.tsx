import { useId } from 'react';
import { DIFFICULTY_OPTIONS } from '../config/constants';
import { Icon, Spinner } from './icons';
import { useDndCourseStore } from '../model/store';

const STEPS = [
  {
    icon: 'course',
    title: 'Основа курса',
    text: 'Название, описание, сложность и теги',
  },
  {
    icon: 'upload',
    title: 'Материалы',
    text: 'Документы превращаются в карточки на холсте',
  },
  { icon: 'lesson', title: 'Уроки', text: 'Перетаскивайте материалы в уроки' },
  {
    icon: 'module',
    title: 'Модули',
    text: 'Собирайте уроки в модули и завершайте',
  },
];

export function StartScreen() {
  const form = useDndCourseStore((state) => state.courseForm);
  const error = useDndCourseStore((state) => state.courseError);
  const notice = useDndCourseStore((state) => state.courseNotice);
  const leftovers = useDndCourseStore(
    (state) => state.materials.length + state.lessons.length,
  );
  const resetAll = useDndCourseStore((state) => state.resetAll);
  const busy = useDndCourseStore((state) => Boolean(state.pending.course));
  const setCourseForm = useDndCourseStore((state) => state.setCourseForm);
  const createCourse = useDndCourseStore((state) => state.createCourse);
  const id = useId();
  const errorId = `${id}-error`;
  const titleMissing = Boolean(error) && !form.title.trim();
  const descriptionMissing = Boolean(error) && !form.description.trim();

  return (
    <section
      className="dnd-start tw:grid tw:grid-cols-[minmax(0,_1fr)_minmax(0,_520px)] tw:gap-[clamp(20px,_4vw,_56px)] tw:p-[clamp(18px,_3vw,_40px)] tw:rounded-[22px] tw:max-1024:grid-cols-[1fr] tw:[align-items:start] tw:[border:1px_solid_var(--dnd-border)] tw:[background:radial-gradient(90%_120%_at_0%_0%,_var(--dnd-accent-soft),_transparent_55%),_var(--dnd-panel)] tw:[box-shadow:var(--dnd-shadow)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
      aria-labelledby={`${id}-title`}
    >
      <div className="dnd-start-intro tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <span className="dnd-eyebrow tw:inline-block tw:mb-[10px] tw:text-(--dnd-blue-ink) tw:text-[0.78rem] tw:font-[800] tw:tracking-[0.12em] tw:uppercase tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          Drag &amp; Drop курс
        </span>
        <h1
          className="tw:tracking-[-0.025em] tw:m-[0_0_12px] tw:text-(--dnd-heading) tw:[&&&]:text-[clamp(1.6rem,_3vw,_2.4rem)] tw:[&&&]:leading-[1.15] tw:[font-family:'Unbounded',_sans-serif] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[clamp(1.6rem,_3vw,_2.4rem)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.15] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:[font-family:'Unbounded',_sans-serif]"
          id={`${id}-title`}
        >
          Создайте основу курса
        </h1>
        {notice ? (
          <div
            className="dnd-inline-error dnd-start-notice tw:[.page_.dnd-builder_&]:m-[0_0_18px] tw:[.page_.dnd-builder_&]:max-w-[60ch] tw:[.page_.dnd-builder_&_>_span]:flex-[1_1_180px] tw:[.page_.dnd-builder_&_>_span]:min-w-[0] tw:[.page_.dnd-builder_&_>_span]:wrap-anywhere"
            role="alert"
          >
            <Icon name="alert" size={16} />
            <span>{notice}</span>
            {leftovers ? (
              <button
                type="button"
                className="dnd-btn dnd-btn--ghost dnd-btn--sm"
                onClick={() => resetAll()}
              >
                Очистить черновик
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="tw:tracking-[0.012em] tw:m-[0_0_22px] tw:max-w-[54ch] tw:text-(--dnd-muted) tw:[&&&]:text-[0.98rem] tw:[&&&]:leading-[1.6] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.98rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.6] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
          Сначала сохраним карточку курса — без неё сервер не примет материалы.
          Затем откроется холст: загружайте документы, перетаскивайте их в
          уроки, а уроки — в модули.
        </p>
        <ol className="dnd-start-steps tw:m-[0] tw:p-[0] tw:grid tw:gap-[10px] tw:[list-style:none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className={`tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:flex tw:items-center tw:gap-[12px] tw:p-[10px_12px] tw:rounded-[14px] tw:border-solid tw:border-[transparent] tw:[border-width:1px] tw:[.page_.dnd-builder_.dnd-start-steps_&.is-current]:border-(--dnd-border) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-start-steps_&.is-current]:[background:var(--dnd-node)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] ${index === 0 ? 'is-current' : ''}`}
            >
              <span className="dnd-start-step-icon tw:grid tw:w-[38px] tw:h-[38px] tw:flex-[none] tw:rounded-[11px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-muted) tw:[place-items:center] tw:[background:var(--dnd-panel-2)] tw:[border-width:1px] tw:[.page_.dnd-builder_.dnd-start-steps_li.is-current_&]:border-(--dnd-accent) tw:[.page_.dnd-builder_.dnd-start-steps_li.is-current_&]:text-[#241c24] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-start-steps_li.is-current_&]:[background:var(--dnd-accent)]">
                <Icon name={step.icon} size={18} />
              </span>
              <span className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                <strong className="tw:block tw:text-[0.9rem] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                  {step.title}
                </strong>
                <small className="tw:text-[0.8rem] tw:block tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
                  {step.text}
                </small>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <form
        className="dnd-start-form tw:grid tw:gap-[16px] tw:p-[clamp(16px,_2.4vw,_26px)] tw:rounded-[18px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:[box-shadow:var(--dnd-shadow)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
        noValidate
        aria-describedby={error ? errorId : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          void createCourse();
        }}
      >
        <div
          className={`dnd-field tw:grid tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.has-error_input]:border-(--dnd-error) tw:[.page_.dnd-builder_&.has-error_textarea]:border-(--dnd-error) ${titleMissing ? 'has-error' : ''}`}
        >
          <label
            className="tw:text-[0.8rem] tw:font-[700] tw:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            htmlFor={`${id}-name`}
          >
            Название курса
            <span
              className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
              aria-hidden="true"
            >
              {' '}
              *
            </span>
          </label>
          <input
            className="tw:text-[0.88rem] tw:leading-[1.45] tw:w-[100%] tw:min-h-[40px] tw:p-[9px_12px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:[font-family:inherit] tw:[border-width:1px] tw:focus:border-(--dnd-focus) tw:[background:var(--dnd-node)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:focus:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.88rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.45] tw:focus:focus-visible:[&&&]:[outline:none]"
            id={`${id}-name`}
            value={form.title}
            onChange={(event) => setCourseForm({ title: event.target.value })}
            placeholder="Например: Основы Python для аналитиков"
            aria-required="true"
            aria-invalid={titleMissing || undefined}
            aria-describedby={titleMissing ? errorId : undefined}
            maxLength={200}
            disabled={busy}
            autoFocus
          />
        </div>
        <div
          className={`dnd-field tw:grid tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.has-error_input]:border-(--dnd-error) tw:[.page_.dnd-builder_&.has-error_textarea]:border-(--dnd-error) ${descriptionMissing ? 'has-error' : ''}`}
        >
          <label
            className="tw:text-[0.8rem] tw:font-[700] tw:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            htmlFor={`${id}-description`}
          >
            Описание
            <span
              className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
              aria-hidden="true"
            >
              {' '}
              *
            </span>
          </label>
          <textarea
            className="tw:text-[0.88rem] tw:leading-[1.45] tw:w-[100%] tw:min-h-[40px] tw:p-[9px_12px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:resize-y tw:[font-family:inherit] tw:[border-width:1px] tw:focus:border-(--dnd-focus) tw:[background:var(--dnd-node)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:focus:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.88rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.45] tw:focus:focus-visible:[&&&]:[outline:none]"
            id={`${id}-description`}
            value={form.description}
            onChange={(event) =>
              setCourseForm({ description: event.target.value })
            }
            placeholder="Кратко опишите, чему научится студент"
            rows={4}
            aria-required="true"
            aria-invalid={descriptionMissing || undefined}
            aria-describedby={descriptionMissing ? errorId : undefined}
            disabled={busy}
          />
        </div>
        <div className="dnd-start-grid tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:max-767:grid-cols-[1fr] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <div className="dnd-field tw:grid tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.has-error_input]:border-(--dnd-error) tw:[.page_.dnd-builder_&.has-error_textarea]:border-(--dnd-error)">
            <label
              className="tw:text-[0.8rem] tw:font-[700] tw:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
              htmlFor={`${id}-difficulty`}
            >
              Сложность
            </label>
            <select
              className="tw:text-[0.88rem] tw:leading-[1.45] tw:w-[100%] tw:min-h-[40px] tw:p-[9px_12px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:[font-family:inherit] tw:[border-width:1px] tw:focus:border-(--dnd-focus) tw:[background:var(--dnd-node)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:focus:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.88rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.45] tw:focus:focus-visible:[&&&]:[outline:none]"
              id={`${id}-difficulty`}
              value={form.difficulty}
              onChange={(event) =>
                setCourseForm({ difficulty: event.target.value })
              }
              disabled={busy}
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option
                  className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="dnd-field tw:grid tw:gap-[6px] tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&.has-error_input]:border-(--dnd-error) tw:[.page_.dnd-builder_&.has-error_textarea]:border-(--dnd-error)">
            <label
              className="tw:text-[0.8rem] tw:font-[700] tw:text-(--dnd-text) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
              htmlFor={`${id}-tags`}
            >
              Теги
            </label>
            <input
              className="tw:text-[0.88rem] tw:leading-[1.45] tw:w-[100%] tw:min-h-[40px] tw:p-[9px_12px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:[font-family:inherit] tw:[border-width:1px] tw:focus:border-(--dnd-focus) tw:[background:var(--dnd-node)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[transition:border-color_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus:[outline:none] tw:focus-visible:[outline-offset:2px] tw:focus:[box-shadow:0_0_0_3px_var(--dnd-focus-ring)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.88rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.45] tw:focus:focus-visible:[&&&]:[outline:none]"
              id={`${id}-tags`}
              value={form.tags}
              onChange={(event) => setCourseForm({ tags: event.target.value })}
              placeholder="python, backend, junior"
              aria-describedby={`${id}-tags-hint`}
              disabled={busy}
            />
            <small
              id={`${id}-tags-hint`}
              className="dnd-field-hint tw:text-[0.76rem] tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&]:text-[0.76rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&]:text-[0.76rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.76rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
            >
              Через запятую
            </small>
          </div>
        </div>
        {error ? (
          <p
            id={errorId}
            className="dnd-inline-error tw:[.page_.dnd-builder_&_>_span]:flex-[1_1_180px] tw:[.page_.dnd-builder_&_>_span]:min-w-[0] tw:[.page_.dnd-builder_&_>_span]:wrap-anywhere"
            role="alert"
          >
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </p>
        ) : null}
        <button
          type="submit"
          className="dnd-btn dnd-btn--accent dnd-btn--lg tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-accent) tw:text-[#241c24] tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:w-[100%] tw:[&&&&]:text-[0.95rem] tw:[&&&&]:min-h-[48px] tw:[&&&&]:p-[0_22px] tw:[border-width:1px] tw:[background:var(--dnd-accent)] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&&]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-accent-ink) tw:[&:active:not(:disabled)]:[transform:translateY(1px)] tw:[&:hover:not(:disabled)]:[box-shadow:0_6px_18px_rgba(203,_170,_203,_0.45)]"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? <Spinner size={16} /> : <Icon name="arrowRight" size={18} />}
          {busy ? 'Создаём курс…' : 'Создать и открыть конструктор'}
        </button>
      </form>
    </section>
  );
}
