import { DRAG_MIME, MATERIAL_STATUS } from "../config/constants";
import { Icon } from "./icons";
import { useDndCourseStore } from "../model/store";
import { StatusPill, useDndActions } from "./common";

const ADD_ITEMS = [
  { id: "material", icon: "upload", label: "Загрузить материалы", hint: "PDF, DOCX, TXT и другие документы до 30 МБ" },
  { id: "lesson", icon: "lesson", label: "Создать урок", hint: "Из выделенных или выбранных материалов" },
  { id: "module", icon: "module", label: "Создать модуль", hint: "Из готовых уроков" },
];

export function Palette({ variant = "side" }) {
  const restartOnboarding = useDndCourseStore((state) => state.restartOnboarding);
  const setPaletteOpen = useDndCourseStore((state) => state.setPaletteOpen);
  const openMaterialPicker = useDndCourseStore((state) => state.openMaterialPicker);
  const openModuleDialog = useDndCourseStore((state) => state.openModuleDialog);
  const createLesson = useDndCourseStore((state) => state.createLessonFromMaterials);
  const { pickFiles } = useDndActions();

  const runAdd = (id: string) => {
    const state = useDndCourseStore.getState();
    if (id === "material") pickFiles();
    if (id === "lesson") {
      const selected = state.selectedIds
        .filter((item) => item.startsWith("material:"))
        .map((item) => item.slice("material:".length));
      if (selected.length) createLesson(selected);
      else openMaterialPicker();
    }
    if (id === "module") openModuleDialog([], { pick: true });
    if (variant === "sheet") setPaletteOpen(false);
  };

  return (
    <nav className={`dnd-palette tw:flex tw:flex-col tw:gap-[18px] tw:p-[16px] tw:overflow-y-auto tw:min-h-[0] tw:[background:var(--dnd-panel)] tw:[border-right:1px_solid_var(--dnd-border)] tw:[&.dnd-palette--sheet]:absolute tw:[&.dnd-palette--sheet]:z-[30] tw:[&.dnd-palette--sheet]:top-[0] tw:[&.dnd-palette--sheet]:bottom-[0] tw:[&.dnd-palette--sheet]:left-[0] tw:[&.dnd-palette--sheet]:w-[min(320px,_88%)] tw:[&.dnd-palette--sheet]:animate-dnd-slide-left tw:[&.dnd-palette--sheet]:[box-shadow:var(--dnd-shadow-lg)] dnd-palette--${variant}`} aria-label="Палитра элементов">
      <div className="dnd-palette-head tw:flex tw:items-center tw:justify-between">
        <strong className="tw:text-[0.95rem]">Палитра</strong>
        <button type="button" className="dnd-icon-btn tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[36px] tw:h-[36px] tw:flex-[none] tw:rounded-[9px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[&&&&]:[background:var(--dnd-panel-2)]" onClick={() => setPaletteOpen(false)} aria-label="Свернуть палитру" title="Свернуть палитру">
          <Icon name={variant === "sheet" ? "close" : "panel"} />
        </button>
      </div>

      <section className="dnd-palette-section tw:grid tw:gap-[8px]" aria-labelledby="dnd-palette-add">
        <h3 className="tw:text-[0.72rem] tw:leading-[1.38] tw:tracking-[0.08em] tw:font-[800] tw:uppercase tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.72rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:tracking-[0.08em]" id="dnd-palette-add">Добавить</h3>
        {ADD_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="dnd-palette-item tw:text-[0.96rem] tw:leading-[1.45] tw:grid tw:grid-cols-[36px_minmax(0,_1fr)_16px] tw:items-center tw:gap-[10px] tw:p-[10px] tw:rounded-[12px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:text-left tw:cursor-grab tw:[border-width:1px] tw:hover:border-(--dnd-border-strong) tw:[background:var(--dnd-node)] tw:active:cursor-grabbing tw:[transition:border-color_0.15s,_box-shadow_0.15s,_transform_0.15s] tw:hover:[box-shadow:var(--dnd-shadow)] tw:hover:[transform:translateY(-1px)]"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_MIME, item.id);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => runAdd(item.id)}
            title={`${item.label}. Можно нажать или перетащить на холст`}
          >
            <span className="dnd-palette-icon tw:grid tw:w-[36px] tw:h-[36px] tw:rounded-[10px] tw:text-(--dnd-accent-ink) tw:[place-items:center] tw:[background:var(--dnd-accent-soft)]">
              <Icon name={item.icon} size={18} />
            </span>
            <span>
              <strong className="tw:block tw:text-[0.92rem]">{item.label}</strong>
              <small className="tw:text-[0.8rem] tw:leading-[1.3] tw:block tw:text-(--dnd-muted) tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.3]">{item.hint}</small>
            </span>
            <Icon name="grip" size={16} className="dnd-palette-grip" />
          </button>
        ))}
      </section>

      <details className="dnd-palette-section dnd-help-group tw:block tw:gap-[8px] tw:pt-[12px] tw:[border-top:1px_solid_var(--dnd-border)] tw:[.page_.dnd-builder_&_.dnd-btn]:w-[100%]">
        <summary className="dnd-help-group-summary tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:cursor-pointer tw:rounded-[8px] tw:p-[6px_2px] tw:text-[0.78rem] tw:font-[800] tw:tracking-[0.08em] tw:uppercase tw:text-(--dnd-muted) tw:[list-style:none] tw:hover:text-(--dnd-text) tw:[&::-webkit-details-marker]:hidden">
          <span>Помощь</span>
          <Icon name="chevronDown" size={16} className="dnd-chevron" />
        </summary>
        <details className="dnd-help tw:rounded-[10px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:[&:not(summary)]:mt-[8px]">
          <summary className="tw:p-[9px_12px] tw:font-[650] tw:text-[0.84rem] tw:cursor-pointer tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:rounded-[8px] tw:[list-style:none] tw:[&::-webkit-details-marker]:hidden">
            <span>Как собрать курс</span>
            <Icon name="chevronDown" size={15} className="dnd-chevron" />
          </summary>
          <ol className="tw:m-[0] tw:p-[0_12px_12px_30px] tw:grid tw:gap-[6px]">
            <li className="tw:text-(--dnd-muted) tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]">Загрузите документы — каждый станет материалом.</li>
            <li className="tw:text-(--dnd-muted) tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]">Перетащите один или несколько материалов в зону «Новый урок».</li>
            <li className="tw:text-(--dnd-muted) tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]">Перетащите уроки на модуль или в зону «Новый модуль».</li>
            <li className="tw:text-(--dnd-muted) tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]">Проверьте структуру и нажмите «Завершить».</li>
          </ol>
        </details>
        <details className="dnd-help tw:rounded-[10px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:[&:not(summary)]:mt-[8px]">
          <summary className="tw:p-[9px_12px] tw:font-[650] tw:text-[0.84rem] tw:cursor-pointer tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:rounded-[8px] tw:[list-style:none] tw:[&::-webkit-details-marker]:hidden">
            <span>Типы узлов</span>
            <Icon name="chevronDown" size={15} className="dnd-chevron" />
          </summary>
          <ul className="dnd-help-legend tw:m-[0] tw:p-[0_12px_12px_30px] tw:pl-[12px]! tw:grid tw:gap-[6px] tw:[list-style:none]">
            <li className="tw:text-(--dnd-muted) tw:flex tw:items-center tw:gap-[8px] tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]"><Icon name="file" size={15} /> Материал — текст из документа</li>
            <li className="tw:text-(--dnd-muted) tw:flex tw:items-center tw:gap-[8px] tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]"><Icon name="lesson" size={15} /> Урок — до 10 блоков материалов</li>
            <li className="tw:text-(--dnd-muted) tw:flex tw:items-center tw:gap-[8px] tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]"><Icon name="module" size={15} /> Модуль — группа уроков</li>
            <li className="tw:text-(--dnd-muted) tw:flex tw:items-center tw:gap-[8px] tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]"><Icon name="course" size={15} /> Курс — корень, к нему подключены модули</li>
          </ul>
        </details>
        <details className="dnd-help tw:rounded-[10px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:[&:not(summary)]:mt-[8px]">
          <summary className="tw:p-[9px_12px] tw:font-[650] tw:text-[0.84rem] tw:cursor-pointer tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:rounded-[8px] tw:[list-style:none] tw:[&::-webkit-details-marker]:hidden">
            <span>Статусы</span>
            <Icon name="chevronDown" size={15} className="dnd-chevron" />
          </summary>
          <ul className="dnd-help-legend tw:m-[0] tw:p-[0_12px_12px_30px] tw:pl-[12px]! tw:grid tw:gap-[6px] tw:[list-style:none]">
            {Object.entries(MATERIAL_STATUS).map(([key, value]) => (
              <li className="tw:text-(--dnd-muted) tw:flex tw:items-center tw:gap-[8px] tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]" key={key}>
                <StatusPill tone={value.tone} icon={key === "error" ? "alert" : key === "used" ? "link" : key === "ready" ? "check" : "clock"}>
                  {value.label}
                </StatusPill>
              </li>
            ))}
          </ul>
        </details>
        <details className="dnd-help tw:rounded-[10px] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-node)] tw:[&:not(summary)]:mt-[8px]">
          <summary className="tw:p-[9px_12px] tw:font-[650] tw:text-[0.84rem] tw:cursor-pointer tw:flex tw:items-center tw:justify-between tw:gap-[8px] tw:rounded-[8px] tw:[list-style:none] tw:[&::-webkit-details-marker]:hidden">
            <span>Подсказки по перетаскиванию</span>
            <Icon name="chevronDown" size={15} className="dnd-chevron" />
          </summary>
          <ul className="tw:m-[0] tw:p-[0_12px_12px_30px] tw:grid tw:gap-[6px]">
            <li className="tw:text-(--dnd-muted) tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]">Shift + клик — выделить несколько элементов, Shift + протянуть по холсту — выделить рамкой.</li>
            <li className="tw:text-(--dnd-muted) tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]">Пустая область холста двигает рабочее поле, колёсико прокручивает, Ctrl + колёсико — масштаб.</li>
            <li className="tw:text-(--dnd-muted) tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]">Можно тянуть линию от точки справа на карточке к другой карточке.</li>
            <li className="tw:text-(--dnd-muted) tw:[&&&]:text-[0.8rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.8rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]">Всё, что делается перетаскиванием, есть и в кнопках карточек и инспектора.</li>
          </ul>
        </details>
        <button type="button" className="dnd-btn dnd-btn--ghost dnd-btn--sm tw:text-[0.82rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[32px] tw:p-[0_12px] tw:rounded-[9px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:w-[100%] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:disabled:opacity-[0.55] tw:[&:not(summary)]:mt-[8px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.82rem] tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-border-strong) tw:[&:active:not(:disabled)]:[transform:translateY(1px)] tw:[&:hover:not(:disabled)]:[&&&&]:[background:var(--dnd-panel-2)]" onClick={restartOnboarding}>
          <Icon name="restart" size={15} /> Показать обучение снова
        </button>
      </details>
    </nav>
  );
}
