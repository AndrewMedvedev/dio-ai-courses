// Данные конструктора курса: курс, материалы, уроки, модули и состояние холста.
import type { RawApiRecord } from "@/shared/api";

export type CourseDifficulty = "beginner" | "intermediate" | "advanced" | "expert";

export interface DndCourse {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  tags: string[];
}

/** Форма создания курса до того, как он появится на сервере. */
export interface CourseForm {
  title: string;
  description: string;
  difficulty: string;
  tags: string;
}

export type MaterialStatus = "uploading" | "ready" | "error";

/** Загруженный документ: распознанный текст, из которого собираются уроки. */
export interface DndMaterial {
  id: string;
  fileName: string;
  fileKind?: string;
  size: number | null;
  number: number;
  status: MaterialStatus;
  markdown: string;
  /** Правка от ИИ, которую можно применить к тексту. */
  proposal: string | null;
  error: string;
  aiError?: string;
  tooBig?: boolean;
  interrupted?: boolean;
  lessonId: string | null;
  /** Урок, в который материал добавится, как только обработается. */
  attachToLessonId?: string | null;
}

export interface DndLesson {
  id: string;
  title: string;
  description: string;
  order: number;
  learningObjectives: string[];
  estimatedTimeMinutes: number | null;
  contentBlocks: RawApiRecord[];
  materialIds: string[];
  moduleId: string | null;
  /** Урок без модуля живёт только в черновике и ещё не создан на сервере. */
  isLocal: boolean;
}

export interface DndModule {
  id: string;
  title: string;
  description: string;
  order: number;
  learningObjectives: string[];
  lessonIds: string[];
}

export interface XY {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends XY, Size {
  id?: string;
}

export interface Viewport extends XY {
  zoom: number;
}

export type NodeType = "course" | "material" | "lesson" | "module";

export type InspectorTab = string | null;

export interface InspectorState {
  open: boolean;
  tab: InspectorTab;
}

/** Значения формы в инспекторе: строки, как в полях ввода. */
export type EntityForm = Record<string, string>;

export interface ModuleDialogState {
  title: string;
  description: string;
  learningObjectives: string;
  lessonIds: string[];
  pick: boolean;
  error: string;
}

/** Черновик конструктора, который хранится в localStorage. */
export interface DndDraft {
  course: DndCourse | null;
  courseForm: CourseForm;
  materials: DndMaterial[];
  lessons: DndLesson[];
  modules: DndModule[];
  positions: Record<string, XY>;
  viewport: Viewport;
  selectedIds: string[];
  activeNodeId: string | null;
  inspector: InspectorState;
  onboardingDismissed: boolean;
  showUsedMaterials: boolean;
  inspectorWidths: Record<string, number>;
  celebrated: boolean;
  filter: string | null;
  viewMode: string | null;
  forms: Record<string, EntityForm>;
  moduleDialog: ModuleDialogState | null;
}

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  timeout?: number;
  retry?: () => void;
}

export interface DndToast extends ToastOptions {
  id: number;
  type: ToastType;
  text: string;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  consequences?: string[];
  confirmLabel?: string;
  onConfirm?: () => unknown;
}

export interface DropHint {
  targetId: string | null;
  zone: string | null;
  valid: boolean;
  reason?: string;
  label?: string;
}

export type SaveStatus = "dirty" | "saving" | "saved" | "error";

/** Состояние, которое не сохраняется в черновик. */
export interface DndTransient {
  hydrated: boolean;
  pending: Record<string, boolean>;
  saveStatus: Record<string, SaveStatus>;
  saveErrors: Record<string, string>;
  courseError: string;
  courseNotice: string;
  toasts: DndToast[];
  confirm: ConfirmRequest | null;
  finishOpen: boolean;
  finishError: string;
  materialPicker: { selected: string[] } | null;
  announcement: string;
  flash: Record<string, number>;
  focusRequest: { ids: string[]; at: number } | null;
  paletteOpen: boolean;
  fullscreen: boolean;
  dropHint: DropHint | null;
  dragKind: string | null;
}

export type MaterialsCheck =
  | { ok: true; materials: DndMaterial[]; reason?: undefined }
  | { ok: false; reason: string; materials?: undefined };

export interface DndActions {
  hydrate: () => void;
  persistNow: () => void;
  dismissToast: (id: number) => void;
  toast: (type: ToastType, text: string, options?: ToastOptions) => number;
  announce: (text: string) => void;
  verifyCourse: () => Promise<unknown>;
  setCourseForm: (patch: Partial<CourseForm>) => void;
  createCourse: () => Promise<unknown>;
  saveCourse: () => Promise<unknown>;
  addFiles: (
    fileList: FileList | File[] | null | undefined,
    options?: { position?: XY | null; attachToLessonId?: string | null },
  ) => string[];
  uploadMaterial: (id: string) => Promise<unknown>;
  retryMaterial: (id: string, replacementFile?: File | null) => boolean;
  updateMaterialMarkdown: (id: string, markdown: string) => void;
  deleteMaterial: (id: string) => void;
  askMaterialAi: (id: string, prompt: string) => Promise<unknown>;
  applyProposal: (id: string) => void;
  rejectProposal: (id: string) => void;
  validateMaterialsForLesson: (
    materialIds: string[],
    lessonId?: string | null,
  ) => MaterialsCheck;
  createLessonFromMaterials: (
    materialIds: string[],
    options?: { position?: XY | null },
  ) => Promise<string | null>;
  addMaterialsToLesson: (lessonId: string, materialIds: string[]) => Promise<boolean>;
  saveLessonMeta: (lessonId: string) => Promise<unknown>;
  setLessonContent: (lessonId: string, contentBlocks: RawApiRecord[]) => void;
  saveLessonContentNow: (lessonId: string) => Promise<unknown>;
  deleteLesson: (lessonId: string) => Promise<boolean>;
  openModuleDialog: (lessonIds?: string[], options?: { pick?: boolean }) => void;
  updateModuleDialog: (patch: Partial<ModuleDialogState>) => void;
  closeModuleDialog: () => void;
  submitModuleDialog: () => Promise<unknown>;
  moveLessonToModule: (
    lessonId: string,
    targetModuleId: string | null,
    toIndex?: number | null,
  ) => Promise<unknown>;
  reorderLesson: (moduleId: string, lessonId: string, toIndex: number) => Promise<unknown>;
  moveLessonBy: (lessonId: string, delta: number) => void;
  reorderModule: (moduleId: string, toIndex: number) => Promise<unknown>;
  moveModuleBy: (moduleId: string, delta: number) => void;
  saveModuleMeta: (moduleId: string) => Promise<unknown>;
  deleteModule: (moduleId: string) => Promise<unknown>;
  setSelection: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  openInspector: (id: string, tab?: InspectorTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  closeInspector: () => void;
  updateForm: (
    key: string,
    type: NodeType,
    entity: unknown,
    patch: EntityForm,
  ) => void;
  resetForm: (key: string) => void;
  setPositions: (patch: Record<string, XY>) => void;
  setViewport: (viewport: Viewport) => void;
  setFilter: (filter: string | null) => void;
  setViewMode: (viewMode: string | null) => void;
  setPaletteOpen: (paletteOpen: boolean) => void;
  setDropHint: (dropHint: DropHint | null) => void;
  setDragKind: (dragKind: string | null) => void;
  requestFocus: (ids: string[]) => void;
  dismissOnboarding: () => void;
  setInspectorWidth: (kind: string, width: number) => void;
  toggleFullscreen: () => void;
  toggleUsedMaterials: () => void;
  restartOnboarding: () => void;
  markCelebrated: () => void;
  openMaterialPicker: () => void;
  closeMaterialPicker: () => void;
  toggleMaterialPick: (id: string) => void;
  openConfirm: (confirm: ConfirmRequest) => void;
  closeConfirm: () => void;
  openFinish: () => void;
  closeFinish: () => void;
  finish: (onCreateCourse: (params: { courseId: string }) => unknown) => Promise<unknown>;
  loadFromServer: (courseId: string) => Promise<unknown>;
  resetAll: (options?: { silent?: boolean }) => void;
}

export type DndState = DndDraft & DndTransient & DndActions;
