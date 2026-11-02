import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CourseNavigationTree,
  ContentBlocks,
  CourseBasicInfo,
  LessonBasicInfo,
  LessonList,
  ModuleBasicInfo,
  ModuleList,
  archiveCourse,
  publishCourse,
  setCourseInviteOnly,
} from "@/entities/course";
import { SectionTop } from "@/shared/ui/section-top";
import "@/entities/course/ui/course-viewer.css";
import { useSessionStore } from "@/entities/session";
import { getApiErrorMessage } from "../lib/helpers";
import { Icon, Spinner } from "./icons";
import {
  fetchCourseStructure,
  fetchLessonBlocks,
  type CourseStructure,
} from "../api/server-course";
import type { RawApiRecord } from "@/shared/api";
import { useDndCourseStore } from "../model/store";
import { ActionMenu, ConfirmDialog, StatusPill, Toasts } from "./common";
import { DndTooltipLayer } from "./Tooltip";

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Черновик", tone: "muted" },
  in_generation: { label: "Черновик", tone: "muted" },
  published: { label: "Опубликован", tone: "ok" },
  invite_only: { label: "Только по приглашению", tone: "used" },
  archived: { label: "В архиве", tone: "error" },
};

export function CoursePreview({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedLessonId = searchParams.get("lesson");
  const user = useSessionStore((state) => state.user);
  const hydrate = useDndCourseStore((state) => state.hydrate);
  const toast = useDndCourseStore((state) => state.toast);
  const openConfirm = useDndCourseStore((state) => state.openConfirm);
  const [data, setData] = useState<CourseStructure | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [lessonBlocks, setLessonBlocks] = useState<
    Record<string, RawApiRecord[]>
  >({});
  const [lessonError, setLessonError] = useState("");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const load = useCallback(async () => {
    setError("");
    setData(null);
    try {
      const result = await fetchCourseStructure(courseId);
      setData(result);
      setStatus(result.status);
      const requested = requestedLessonId && result.modules.some((module) => module.lessons.some((lesson) => lesson.id === requestedLessonId));
      setActiveLessonId((current) => current || (requested ? requestedLessonId : null));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, "Не удалось загрузить курс."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeLessonId || lessonBlocks[activeLessonId]) return;
    let cancelled = false;
    setLessonError("");
    fetchLessonBlocks(activeLessonId)
      .then((blocks) => {
        if (!cancelled) setLessonBlocks((current) => ({ ...current, [activeLessonId]: blocks }));
      })
      .catch((loadError) => {
        if (!cancelled) setLessonError(getApiErrorMessage(loadError, "Не удалось загрузить урок."));
      });
    return () => {
      cancelled = true;
    };
  }, [activeLessonId, lessonBlocks]);

  const flatLessons = useMemo(
    () =>
      (data?.modules || []).flatMap((module, moduleIndex) =>
        module.lessons.map((lesson, lessonIndex) => ({ ...lesson, module, moduleIndex, lessonIndex })),
      ),
    [data],
  );
  const activeIndex = flatLessons.findIndex((lesson) => lesson.id === activeLessonId);
  const active = activeIndex >= 0 ? flatLessons[activeIndex] : null;
  const treeCourse = useMemo(
    () =>
      data
        ? {
            ...data.course,
            blocks: data.modules.map((module) => ({ ...module, practice: [] })),
          }
        : null,
    [data],
  );
  const moduleIndex = (data?.modules || []).findIndex((module) => module.id === (active?.module.id || activeModuleId));
  const activeModule =
    data && moduleIndex >= 0 ? { ...data.modules[moduleIndex], order: moduleIndex } : null;
  const openBlock = (blockId: string) => {
    setActiveModuleId(blockId);
    setActiveLessonId(null);
  };
  const openLesson = (lessonId: string | undefined) => {
    if (lessonId === undefined) return;
    const lesson = flatLessons.find((item) => item.id === lessonId);
    if (lesson) setActiveModuleId(lesson.module.id);
    setActiveLessonId(lessonId);
  };
  const openOverview = () => {
    setActiveModuleId(null);
    setActiveLessonId(null);
  };

  const backToBuilder = async () => {
    if (action) return;
    const store = useDndCourseStore.getState();
    if (store.course?.id === courseId) {
      navigate("/drag-and-drop-course");
      return;
    }
    setAction("builder");
    try {
      await store.loadFromServer(courseId);
      navigate("/drag-and-drop-course");
    } catch (loadError) {
      toast("error", getApiErrorMessage(loadError, "Не удалось открыть курс на холсте."));
      setAction("");
    }
  };

  const changeStatus = async (next: "publish" | "invite_only") => {
    if (action) return;
    setAction(next);
    try {
      const result = next === "publish" ? await publishCourse(courseId) : await setCourseInviteOnly(courseId);
      setStatus(result?.status || (next === "publish" ? "published" : "invite_only"));
      toast("success", next === "publish" ? "Курс опубликован" : "Курс доступен только по приглашению");
    } catch (changeError) {
      toast("error", getApiErrorMessage(changeError, "Не удалось изменить статус курса."));
    } finally {
      setAction("");
    }
  };

  const removeCourse = () =>
    openConfirm({
      title: `Удалить курс «${data?.course?.title || ""}»?`,
      message: "Курс уйдёт в архив и пропадёт из каталога.",
      consequences: ["Студенты больше не смогут его открыть.", "Черновик конструктора для этого курса будет очищен."],
      confirmLabel: "Удалить курс",
      onConfirm: async () => {
        try {
          await archiveCourse(courseId);
        } catch (archiveError) {
          toast("error", getApiErrorMessage(archiveError, "Не удалось удалить курс."));
          return false;
        }
        const store = useDndCourseStore.getState();
        if (store.course?.id === courseId) store.resetAll({ silent: true });
        toast("success", "Курс удалён");
        navigate("/drag-and-drop-course", { replace: true });
        return true;
      },
    });

  const startNew = () => {
    useDndCourseStore.getState().resetAll({ silent: true });
    navigate("/drag-and-drop-course");
  };

  const statusInfo = (status && STATUS[status]) || null;
  const course = data?.course;
  const sectionLabel = active ? "Урок" : activeModule ? "Модуль" : "Курс";
  const sectionTitle = active?.title || activeModule?.title || course?.title || "";

  return (
    <div className="dnd-preview-page tw:relative tw:z-[1]">
      <section className="dnd-builder dnd-preview tw:sticky tw:z-[30] tw:w-[min(1720px,_98vw)] tw:m-[0_auto_4px] tw:text-(--dnd-text) tw:text-[0.9rem] tw:leading-[1.4] tw:top-[8px] tw:grid tw:gap-[12px] tw:max-w-[100%] tw:[--dnd-panel:#fbf8f2] tw:[--dnd-panel-2:#f4efe6] tw:[--dnd-canvas:#efe9de] tw:[--dnd-dot:rgba(43,_43,_43,_0.22)] tw:[--dnd-node:#ffffff] tw:[--dnd-node-2:#faf7f2] tw:[--dnd-border:#d9cfbf] tw:[--dnd-border-strong:#b9ab97] tw:[--dnd-text:#2b2b2b] tw:[--dnd-muted:#5f574b] tw:[--dnd-heading:#26231f] tw:[--dnd-accent:#cbaacb] tw:[--dnd-accent-ink:#5e4d5e] tw:[--dnd-accent-soft:rgba(203,_170,_203,_0.22)] tw:[--dnd-blue:#a0c4ff] tw:[--dnd-blue-ink:#2f4f80] tw:[--dnd-focus:#3b6fd8] tw:[--dnd-focus-ring:rgba(59,_111,_216,_0.28)] tw:[--dnd-ok:#2f7d4f] tw:[--dnd-ok-bg:rgba(47,_125,_79,_0.12)] tw:[--dnd-warn:#8a5a00] tw:[--dnd-warn-bg:rgba(212,_150,_30,_0.16)] tw:[--dnd-error:#b42318] tw:[--dnd-error-bg:rgba(180,_35,_24,_0.1)] tw:[--dnd-info:#3b5b8c] tw:[--dnd-info-bg:rgba(59,_91,_140,_0.1)] tw:[--dnd-edge:#a99c88] tw:[--dnd-shadow:0_1px_2px_rgba(60,_48,_30,_0.08),_0_8px_22px_rgba(60,_48,_30,_0.08)] tw:[--dnd-shadow-lg:0_18px_48px_rgba(40,_30,_20,_0.2)] tw:[--dnd-radius:14px] tw:[--dnd-ease:cubic-bezier(0.2,_0.8,_0.2,_1)] tw:max-900:static tw:[font-family:'Manrope',_sans-serif] tw:[--dnd-grid-major:rgba(43,_43,_43,_0.07)] tw:[--dnd-glass:rgba(250,_247,_241,_0.74)] tw:dark:[--dnd-panel:#262626] tw:dark:[--dnd-panel-2:#2d2d2d] tw:dark:[--dnd-canvas:#1d1d1d] tw:dark:[--dnd-dot:rgba(233,_222,_203,_0.16)] tw:dark:[--dnd-node:#2f2f2f] tw:dark:[--dnd-node-2:#343434] tw:dark:[--dnd-border:#4a4a4a] tw:dark:[--dnd-border-strong:#626262] tw:dark:[--dnd-text:#e9decb] tw:dark:[--dnd-muted:#c4b9a7] tw:dark:[--dnd-heading:#f2e7d4] tw:dark:[--dnd-accent-ink:#e6cfe6] tw:dark:[--dnd-accent-soft:rgba(203,_170,_203,_0.16)] tw:dark:[--dnd-blue-ink:#bcd4ff] tw:dark:[--dnd-focus:#8fb4ff] tw:dark:[--dnd-focus-ring:rgba(143,_180,_255,_0.3)] tw:dark:[--dnd-ok:#7fd19b] tw:dark:[--dnd-ok-bg:rgba(127,_209,_155,_0.14)] tw:dark:[--dnd-warn:#f0c060] tw:dark:[--dnd-warn-bg:rgba(240,_192,_96,_0.14)] tw:dark:[--dnd-error:#ff9a8f] tw:dark:[--dnd-error-bg:rgba(255,_154,_143,_0.12)] tw:dark:[--dnd-info:#a9c6ff] tw:dark:[--dnd-info-bg:rgba(169,_198,_255,_0.12)] tw:dark:[--dnd-edge:#7c7466] tw:dark:[--dnd-shadow:0_1px_2px_rgba(0,_0,_0,_0.3),_0_8px_22px_rgba(0,_0,_0,_0.32)] tw:dark:[--dnd-shadow-lg:0_18px_48px_rgba(0,_0,_0,_0.5)] tw:dark:[--dnd-grid-major:rgba(233,_222,_203,_0.06)] tw:dark:[--dnd-glass:rgba(34,_34,_34,_0.74)] tw:[.page_&_.dnd-icon-btn:disabled]:cursor-not-allowed tw:[.page_&_.dnd-icon-btn:disabled]:opacity-[0.4] tw:[.page_&_.dnd-btn]:inline-flex tw:[.page_&_.dnd-btn]:items-center tw:[.page_&_.dnd-btn]:justify-center tw:[.page_&_.dnd-btn]:gap-[8px] tw:[.page_&_.dnd-btn]:min-h-[38px] tw:[.page_&_.dnd-btn]:p-[0_16px] tw:[.page_&_.dnd-btn]:rounded-[10px] tw:[.page_&_.dnd-btn]:[border-width:1px] tw:[.page_&_.dnd-btn]:border-solid tw:[.page_&_.dnd-btn]:border-(--dnd-border) tw:[.page_&_.dnd-btn:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[.page_&_.dnd-btn--ghost]:[background:transparent] tw:[.page_&_.dnd-btn--ghost:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[.page_&_.dnd-btn]:text-(--dnd-text) tw:[.page_&_.dnd-btn]:font-[650] tw:[.page_&_.dnd-btn]:text-[0.875rem] tw:[.page_&_.dnd-btn]:cursor-pointer tw:[.page_&_.dnd-btn:disabled]:cursor-not-allowed tw:[.page_&_.dnd-btn]:whitespace-nowrap tw:[.page_&_.dnd-btn]:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:[.page_&_.dnd-btn:active:not(:disabled)]:[transform:translateY(1px)] tw:[.page_&_.dnd-btn:disabled]:opacity-[0.55] tw:[.page_&_.dnd-visually-hidden]:absolute! tw:[.page_&_.dnd-visually-hidden]:w-[1px]! tw:[.page_&_.dnd-visually-hidden]:h-[1px]! tw:[.page_&_.dnd-visually-hidden]:p-[0]! tw:[.page_&_.dnd-visually-hidden]:m-[-1px]! tw:[.page_&_.dnd-visually-hidden]:overflow-hidden! tw:[.page_&_.dnd-visually-hidden]:[clip:rect(0_0_0_0)]! tw:[.page_&_.dnd-visually-hidden]:whitespace-nowrap! tw:[.page_&_.dnd-visually-hidden]:[border:0]!" aria-label="Просмотр курса">
        <header className="dnd-preview-bar tw:rounded-[16px] tw:flex tw:items-center tw:flex-wrap tw:gap-[12px] tw:p-[12px_14px] tw:[border:1px_solid_var(--glass-border)] tw:[background:var(--dnd-glass)] tw:[-webkit-backdrop-filter:blur(18px)_saturate(140%)] tw:[backdrop-filter:blur(18px)_saturate(140%)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <button type="button" className="dnd-btn dnd-btn--ghost tw:text-[0.875rem] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[38px] tw:p-[0_16px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]" onClick={backToBuilder} disabled={action === "builder"}>
            {action === "builder" ? <Spinner size={14} /> : <Icon name="arrowLeft" size={16} />}
            Вернуться в конструктор
          </button>
          <div className="dnd-preview-bar-title tw:flex-[1] tw:min-w-[0] tw:flex tw:items-center tw:gap-[10px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            <span className="dnd-eyebrow tw:inline-block tw:m-[0] tw:text-(--dnd-blue-ink) tw:text-[0.78rem] tw:font-[800] tw:tracking-[0.12em] tw:uppercase tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">Просмотр курса</span>
            {statusInfo ? (
              <StatusPill tone={statusInfo.tone} icon={status === "published" ? "check" : null}>
                {statusInfo.label}
              </StatusPill>
            ) : null}
          </div>
          <div className="dnd-preview-actions tw:flex tw:items-center tw:flex-wrap tw:gap-[8px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {status !== "published" && status !== "archived" ? (
              <button type="button" className="dnd-btn dnd-btn--accent tw:text-[0.875rem] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[38px] tw:p-[0_16px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-accent) tw:text-[#241c24] tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:var(--dnd-accent)] tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-accent-ink) tw:[&:active:not(:disabled)]:[transform:translateY(1px)] tw:[&:hover:not(:disabled)]:[box-shadow:0_6px_18px_rgba(203,_170,_203,_0.45)]" onClick={() => changeStatus("publish")} disabled={Boolean(action) || !data}>
                {action === "publish" ? <Spinner size={14} /> : <Icon name="flag" size={16} />}
                {action === "publish" ? "Публикуем…" : "Опубликовать"}
              </button>
            ) : null}
            {status !== "invite_only" && status !== "archived" ? (
              <button type="button" className="dnd-btn dnd-btn--ghost tw:text-[0.875rem] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[38px] tw:p-[0_16px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]" onClick={() => changeStatus("invite_only")} disabled={Boolean(action) || !data}>
                {action === "invite_only" ? <Spinner size={14} /> : <Icon name="link" size={16} />}
                {action === "invite_only" ? "Сохраняем…" : "Только по приглашению"}
              </button>
            ) : null}
            <ActionMenu
              label="Ещё действия"
              buttonClassName="dnd-icon-btn"
              align="end"
              items={[
                { key: "student", icon: "eye", label: "Открыть как студент", onSelect: () => navigate(`/course/${courseId}`) },
                { key: "new", icon: "plus", label: "Создать новый курс", onSelect: startNew },
                { key: "sep", type: "separator" },
                { key: "delete", icon: "trash", label: "Удалить курс", danger: true, onSelect: removeCourse, disabled: status === "archived" },
              ]}
            />
          </div>
        </header>

        {error ? (
          <div className="dnd-preview-state tw:[.page_.dnd-builder_&]:rounded-[16px] tw:[.page_.dnd-builder_&]:flex tw:[.page_.dnd-builder_&]:items-center tw:[.page_.dnd-builder_&]:gap-[10px] tw:[.page_.dnd-builder_&]:p-[32px] tw:[.page_.dnd-builder_&]:text-(--dnd-muted) tw:[.page_.dnd-builder_&]:[border:1px_solid_var(--glass-border)] tw:[.page_.dnd-builder_&]:[background:var(--dnd-glass)] tw:[.page_.dnd-builder_&]:[-webkit-backdrop-filter:blur(18px)_saturate(140%)] tw:[.page_.dnd-builder_&]:[backdrop-filter:blur(18px)_saturate(140%)] tw:[.page_.dnd-builder_&]:[box-shadow:var(--glass-shadow),_var(--glass-inset)]">
            <p className="dnd-inline-error" role="alert">
              <Icon name="alert" size={16} />
              <span>{error}</span>
              <button type="button" className="dnd-btn dnd-btn--ghost dnd-btn--sm" onClick={load}>
                <Icon name="retry" size={14} /> Повторить
              </button>
            </p>
          </div>
        ) : !data ? (
          <div className="dnd-preview-state tw:[.page_.dnd-builder_&]:rounded-[16px] tw:[.page_.dnd-builder_&]:flex tw:[.page_.dnd-builder_&]:items-center tw:[.page_.dnd-builder_&]:gap-[10px] tw:[.page_.dnd-builder_&]:p-[32px] tw:[.page_.dnd-builder_&]:text-(--dnd-muted) tw:[.page_.dnd-builder_&]:[border:1px_solid_var(--glass-border)] tw:[.page_.dnd-builder_&]:[background:var(--dnd-glass)] tw:[.page_.dnd-builder_&]:[-webkit-backdrop-filter:blur(18px)_saturate(140%)] tw:[.page_.dnd-builder_&]:[backdrop-filter:blur(18px)_saturate(140%)] tw:[.page_.dnd-builder_&]:[box-shadow:var(--glass-shadow),_var(--glass-inset)]" role="status">
            <Spinner size={18} /> Загружаем курс…
          </div>
        ) : null}
        <ConfirmDialog />
        <Toasts />
        <DndTooltipLayer />
      </section>

      {data && treeCourse && !error ? (
        <section className="container section lesson-view generated-course-learning-view dnd-preview-learning tw:w-[min(1720px,_98vw)] tw:pt-[18px] tw:relative tw:z-[1] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:[--glass-fallback-bg:rgba(243,_239,_231,_0.94)] tw:dark:[--muted:#c4b9a7] tw:dark:[--eyebrow:#a0c4ff] tw:dark:[--ink-accent:#dfd2bf] tw:dark:[--info-text:#b7ab99] tw:dark:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:dark:[--glass-bg-strong:rgba(44,_44,_44,_0.92)] tw:dark:[--glass-fallback-bg:rgba(31,_31,_31,_0.96)] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:[&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg)] tw:no-backdrop-filter:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:[&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card::after]:[content:none]">
          <SectionTop label={sectionLabel} title={sectionTitle} />
          <div className="lesson-view-grid generated-course-learning-grid tw:gap-[18px] tw:mt-[16px] tw:grid tw:min-1301:grid-cols-[300px_minmax(0,_1fr)] tw:between-1101-1300:grid-cols-[280px_minmax(0,_1fr)] tw:max-1100:grid-cols-[1fr] tw:[align-items:start] tw:[&:has(.lesson-page-ai-chat.is-collapsed)]:grid-cols-[300px_minmax(0,_1fr)_68px] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:pr-[clamp(500px,_32vw,_500px)] tw:[&_.course-viewer-card]:w-[100%] tw:[&_.course-viewer-card.module-basic-info]:[border-width:1px] tw:[&_.course-viewer-card.module-basic-info]:border-solid tw:[&_.course-viewer-card.module-basic-info]:border-[rgba(var(--accent-rgb),_0.34)] tw:dark:[.page_&_.course-viewer-card.module-basic-info]:border-[rgba(var(--accent-rgb),_0.42)] tw:[&_.course-viewer-card.module-basic-info]:rounded-[14px] tw:[&_.course-viewer-card.module-basic-info]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:dark:[.page_&_.course-viewer-card.module-basic-info]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)] tw:[&_.course-viewer-card.module-basic-info]:[box-shadow:none] tw:[&_.course-viewer-card.module-basic-info]:[-webkit-backdrop-filter:none] tw:[&_.course-viewer-card.module-basic-info]:[backdrop-filter:none] tw:[&_.course-viewer-card.lesson-basic-info]:[border-width:1px] tw:[&_.course-viewer-card.lesson-basic-info]:border-solid tw:[&_.course-viewer-card.lesson-basic-info]:border-[rgba(var(--accent-rgb),_0.34)] tw:dark:[.page_&_.course-viewer-card.lesson-basic-info]:border-[rgba(var(--accent-rgb),_0.42)] tw:[&_.course-viewer-card.lesson-basic-info]:rounded-[14px] tw:[&_.course-viewer-card.lesson-basic-info]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:dark:[.page_&_.course-viewer-card.lesson-basic-info]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)] tw:[&_.course-viewer-card.lesson-basic-info]:[box-shadow:none] tw:[&_.course-viewer-card.lesson-basic-info]:[-webkit-backdrop-filter:none] tw:[&_.course-viewer-card.lesson-basic-info]:[backdrop-filter:none] tw:[&_.course-viewer-side-card]:[border-width:1px] tw:[&_.course-viewer-side-card]:border-solid tw:[&_.course-viewer-side-card]:border-[rgba(var(--accent-rgb),_0.34)] tw:dark:[.page_&_.course-viewer-side-card]:border-[rgba(var(--accent-rgb),_0.42)] tw:[&_.course-viewer-side-card]:rounded-[14px] tw:[&_.course-viewer-side-card]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:dark:[.page_&_.course-viewer-side-card]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)] tw:[&_.course-viewer-side-card]:[box-shadow:none] tw:[&_.course-viewer-side-card]:[-webkit-backdrop-filter:none] tw:[&_.course-viewer-side-card]:[backdrop-filter:none] tw:[&_.course-viewer-card.course-basic-info]:[border-width:1px] tw:[&_.course-viewer-card.course-basic-info]:border-solid tw:[&_.course-viewer-card.course-basic-info]:border-[rgba(var(--accent-rgb),_0.34)] tw:dark:[.page_&_.course-viewer-card.course-basic-info]:border-[rgba(var(--accent-rgb),_0.42)] tw:[&_.course-viewer-card.course-basic-info]:rounded-[14px] tw:[&_.course-viewer-card.course-basic-info]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:dark:[.page_&_.course-viewer-card.course-basic-info]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)] tw:[&_.course-viewer-card.course-basic-info]:[box-shadow:none] tw:[&_.course-viewer-card.course-basic-info]:[-webkit-backdrop-filter:none] tw:[&_.course-viewer-card.course-basic-info]:[backdrop-filter:none]">
            {treeCourse.blocks.length ? (
              <CourseNavigationTree
                selectedCourse={treeCourse}
                selectedBlock={activeModule || treeCourse.blocks[0]}
                selectedLessonId={activeLessonId || ""}
                selectedPracticeId=""
                completedLessons={{}}
                completedPractices={{}}
                openBlock={openBlock}
                openLesson={openLesson}
                openPractice={() => {}}
                mode="theory"
              />
            ) : (
              <aside className="course-nav-tree generated-course-navigation-shell tw:grid tw:gap-[10px] tw:sticky tw:top-[72px] tw:max-h-[calc(100vh_-_88px)] tw:overflow-x-hidden tw:overflow-y-auto tw:border-solid tw:border-(--glass-border) tw:rounded-[20px] tw:p-[18px_16px] tw:text-(--text) tw:[align-self:start] tw:max-1100:static tw:max-1100:max-h-[none] tw:max-1100:overflow-y-visible tw:[overscroll-behavior-y:contain] tw:[scrollbar-gutter:stable] tw:[border-width:1px] tw:[background:linear-gradient(var(--glass-highlight),_var(--glass-highlight)),_rgba(var(--accent-rgb),_0.05),_var(--glass-bg)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset),_inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.66)_transparent] tw:max-1100:min-h-[auto] tw:dark:[.page_&]:border-[rgba(233,_222,_203,_0.24)] tw:no-backdrop-filter:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[background:var(--glass-fallback-bg)] tw:dark:[.page_&]:text-[#f2e7d4] tw:dark:[.page_&]:[background:linear-gradient(var(--glass-highlight),_var(--glass-highlight)),_var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[background:var(--glass-bg)] tw:dark:[.page_:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[background:var(--glass-bg)]">
                <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">В курсе пока нет модулей.</p>
              </aside>
            )}

            <article className="glass-card lesson-main-card generated-course-main-card tw:w-[100%] tw:border-none tw:border-[currentcolor] tw:rounded-[0] tw:static tw:overflow-visible tw:isolation-auto tw:p-[6px] tw:top-[16px] tw:max-h-[none] tw:col-[auto] tw:[border-width:0] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:none] tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:[overscroll-behavior-y:contain] tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.55)_transparent] tw:max-1100:min-h-[auto] tw:no-backdrop-filter:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:sticky tw:[&::before]:top-[-6px] tw:[&::before]:inset-[auto] tw:[&::before]:z-[20] tw:[&::before]:rounded-[20px_20px_0_0] tw:[&::before]:block tw:[&::before]:w-[calc(100%_+_12px)] tw:[&::before]:h-[52px] tw:[&::before]:ml-[-6px] tw:[&::before]:mb-[-52px] tw:[&::before]:pointer-events-none tw:[&::before]:opacity-[0] tw:[&::before]:[content:''] tw:[&::before]:[background:linear-gradient(_180deg,_rgba(245,_241,_232,_0.98)_0%,_rgba(245,_241,_232,_0.98)_30%,_rgba(245,_241,_232,_0.84)_58%,_rgba(245,_241,_232,_0)_100%_)] tw:[&::before]:[box-shadow:none] tw:[&::before]:[backdrop-filter:blur(12px)] tw:[&::before]:[-webkit-backdrop-filter:blur(12px)] tw:[&::before]:[transform:translateY(-8px)] tw:[&::before]:[transition:opacity_160ms_ease,_transform_160ms_ease] tw:dark:[&::before]:[background:linear-gradient(_180deg,_rgba(31,_31,_31,_0.98)_0%,_rgba(31,_31,_31,_0.98)_30%,_rgba(31,_31,_31,_0.86)_58%,_rgba(31,_31,_31,_0)_100%_)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
              <div className="lesson-scroll-frame generated-course-scroll-frame tw:grid tw:gap-[16px] tw:w-[100%] tw:min-w-[0] tw:max-w-[100%] tw:min-h-[0] tw:isolate tw:overflow-hidden tw:p-[clamp(28px,_3vw,_42px)] tw:border-solid tw:border-(--glass-border) tw:rounded-[24px] tw:[align-content:start] tw:[background:var(--glass-bg-strong)] tw:[border-width:1px] tw:dark:border-[rgba(233,_222,_203,_0.24)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[-webkit-backdrop-filter:none] tw:[backdrop-filter:none] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:pointer-events-none tw:[&::after]:[content:none] tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&_.glass-card]:[background:var(--glass-bg-strong)] tw:[&_.glass-card]:[backdrop-filter:none] tw:[&_.glass-card]:[-webkit-backdrop-filter:none]">
                {active || activeModule ? (
                  <button type="button" className="btn btn-outline dnd-preview-back tw:inline-flex tw:items-center tw:gap-[6px] tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[justify-self:start] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]" onClick={active ? () => setActiveLessonId(null) : openOverview}>
                    <Icon name="arrowLeft" size={15} /> {active ? "К модулю" : "О курсе"}
                  </button>
                ) : null}
                {active ? (
                  <div className="lesson-theory-content">
                    <p className="course-category tw:m-[0] tw:text-[0.88rem] tw:uppercase tw:tracking-[0.09em] tw:text-(--info-text) tw:font-[700] tw:leading-[1.72]">{course?.title}</p>
                    <LessonBasicInfo
                      lesson={{
                        ...active,
                        order: active.lessonIndex,
                        estimated_time_minutes: active.estimatedTimeMinutes ?? null,
                      }}
                    />
                    {lessonError ? (
                      <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]" role="alert">
                        {lessonError}
                      </p>
                    ) : lessonBlocks[active.id] ? (
                      <ContentBlocks blocks={lessonBlocks[active.id]} ownerUserId={user?.id} />
                    ) : (
                      <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]" role="status">
                        Загружаем теорию урока…
                      </p>
                    )}
                    <div className="generated-course-actions dnd-preview-pager tw:flex tw:flex-wrap tw:gap-[10px] tw:justify-between tw:max-w-[100%] tw:min-w-[0] tw:mt-[24px] tw:[.page_.dnd-preview-learning_&_.btn]:inline-flex tw:[.page_.dnd-preview-learning_&_.btn]:items-center tw:[.page_.dnd-preview-learning_&_.btn]:gap-[6px] tw:[.page_.dnd-preview-learning_&_.btn:disabled]:opacity-[0.45] tw:[.page_.dnd-preview-learning_&_.btn:disabled]:cursor-not-allowed">
                      <button type="button" className="btn btn-outline tw:inline-flex tw:items-center tw:gap-[6px] tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:disabled:opacity-[0.45] tw:disabled:cursor-not-allowed tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]" disabled={activeIndex <= 0} onClick={() => openLesson(flatLessons[activeIndex - 1]?.id)}>
                        <Icon name="arrowLeft" size={15} /> Предыдущий урок
                      </button>
                      <button type="button" className="btn btn-solid tw:inline-flex tw:items-center tw:gap-[6px] tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:disabled:opacity-[0.45] tw:disabled:cursor-not-allowed tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]" disabled={activeIndex >= flatLessons.length - 1} onClick={() => openLesson(flatLessons[activeIndex + 1]?.id)}>
                        Следующий урок <Icon name="arrowRight" size={15} />
                      </button>
                    </div>
                  </div>
                ) : activeModule ? (
                  <>
                    <ModuleBasicInfo module={activeModule} />
                    <LessonList
                      lessons={activeModule.lessons.map((lesson, index) => ({ ...lesson, order: index }))}
                      selectedLessonId=""
                      onSelectLesson={openLesson}
                    />
                  </>
                ) : (
                  <>
                    <CourseBasicInfo course={treeCourse} />
                    <ModuleList
                      modules={treeCourse.blocks.map((module, index) => ({ ...module, order: index }))}
                      selectedModuleId=""
                      disabled={false}
                      onSelectModule={openBlock}
                    />
                  </>
                )}
              </div>
            </article>
          </div>
        </section>
      ) : null}
    </div>
  );
}
