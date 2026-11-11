import { toText } from '@/shared/lib/text';
import { asRecord } from '@/shared/api';
import { getLocalStorage } from '@/shared/lib/storage';
import {
  DRAFT_KEY,
  EMPTY_COURSE_FORM,
  INTERRUPTED_UPLOAD_MESSAGE,
  LEGACY_DRAFT_KEY,
} from '../config/constants';
import {
  getFileKind,
  nodeId,
  normalizeCourse,
  normalizeLesson,
  normalizeModule,
} from '../lib/helpers';
import type { RawApiRecord } from '@/shared/api';
import type { DndDraft, DndMaterial, DndModule, Viewport } from './types';

const DEFAULT_VIEWPORT: Viewport = { x: 40, y: 40, zoom: 1 };

export const EMPTY_DRAFT: DndDraft = {
  course: null,
  courseForm: EMPTY_COURSE_FORM,
  materials: [],
  lessons: [],
  modules: [],
  positions: {},
  viewport: DEFAULT_VIEWPORT,
  selectedIds: [],
  activeNodeId: null,
  inspector: { open: false, tab: null },
  onboardingDismissed: false,
  showUsedMaterials: false,
  inspectorWidths: { normal: 440, wide: 660 },
  celebrated: false,
  filter: null,
  viewMode: null,
  forms: {},
  moduleDialog: null,
};

const PERSISTED_KEYS = Object.keys(EMPTY_DRAFT) as (keyof DndDraft)[];

/** Материал без объекта File: File не сериализуется и после перезагрузки потерян. */
function restoreMaterial(material: RawApiRecord, index: number): DndMaterial {
  const status =
    material.status === 'uploading'
      ? material.markdown
        ? 'ready'
        : 'error'
      : material.status === 'ready'
        ? 'ready'
        : 'error';
  return {
    id: toText(material.id),
    fileName: toText(material.fileName || `Материал ${index + 1}`),
    fileKind: toText(
      material.fileKind || getFileKind(toText(material.fileName)),
    ),
    size:
      typeof material.size === 'number' && Number.isFinite(material.size)
        ? material.size
        : null,
    number: Number(
      Number.isFinite(material.number) ? material.number : index + 1,
    ),
    status,
    markdown: toText(material.markdown || ''),
    proposal: toText(material.proposal || null) || null,
    error: toText(
      material.status === 'uploading' && !material.markdown
        ? INTERRUPTED_UPLOAD_MESSAGE
        : material.error || '',
    ),
    interrupted: material.status === 'uploading' && !material.markdown,
    lessonId: toText(material.lessonId || null) || null,
    attachToLessonId: null,
  };
}

function sanitizeDraft(raw: RawApiRecord): DndDraft {
  const draft: RawApiRecord = { ...EMPTY_DRAFT };
  for (const key of PERSISTED_KEYS) {
    if (raw[key] !== undefined && raw[key] !== null) draft[key] = raw[key];
  }
  draft.course = normalizeCourse(asRecord(raw.course));
  draft.courseForm = { ...EMPTY_COURSE_FORM, ...(raw.courseForm || {}) };
  draft.materials = (Array.isArray(raw.materials) ? raw.materials : [])
    .filter((material: RawApiRecord | null) => material?.id)
    .map(restoreMaterial);
  draft.lessons = (Array.isArray(raw.lessons) ? raw.lessons : [])
    .filter((lesson: RawApiRecord | null) => lesson?.id)
    .map((lesson: RawApiRecord) => normalizeLesson(lesson));
  draft.modules = (Array.isArray(raw.modules) ? raw.modules : [])
    .filter((module: RawApiRecord | null) => module?.id)
    .map((module: RawApiRecord) => normalizeModule(module))
    .sort((a: DndModule, b: DndModule) => a.order - b.order);
  draft.positions =
    raw.positions && typeof raw.positions === 'object' ? raw.positions : {};
  draft.viewport =
    raw.viewport && Number.isFinite(asRecord(raw.viewport).zoom)
      ? raw.viewport
      : DEFAULT_VIEWPORT;
  draft.selectedIds = Array.isArray(raw.selectedIds) ? raw.selectedIds : [];
  draft.inspector = {
    open: Boolean(asRecord(raw.inspector)?.open),
    tab: asRecord(raw.inspector)?.tab || null,
  };
  draft.forms = raw.forms && typeof raw.forms === 'object' ? raw.forms : {};
  return draft as unknown as DndDraft;
}

/** Старый черновик «Создать курс самостоятельно» → новая структура. */
export function migrateLegacyDraft(legacy: RawApiRecord): DndDraft {
  const modules = (Array.isArray(legacy.modules) ? legacy.modules : []).map(
    (module: RawApiRecord, index: number) =>
      normalizeModule(module, {
        order: index + 1,
        lessonIds: module.lessonIds || [],
      }),
  );
  const moduleByLesson = new Map<string, string>();
  modules.forEach((module) =>
    module.lessonIds.forEach((lessonId) =>
      moduleByLesson.set(lessonId, module.id),
    ),
  );
  const lessons = (Array.isArray(legacy.lessons) ? legacy.lessons : []).map(
    (lesson: RawApiRecord, index: number) =>
      normalizeLesson(lesson, {
        order: index + 1,
        materialIds: lesson.blockIds || [],
        moduleId: moduleByLesson.get(toText(lesson.id)) || null,
        // Урок без модуля сервер не даст редактировать — переносим его как черновик.
        isLocal: !moduleByLesson.get(toText(lesson.id)),
      }),
  );
  const materials = (Array.isArray(legacy.blocks) ? legacy.blocks : []).map(
    (block: RawApiRecord, index: number) => ({
      id: block.id,
      fileName: block.fileName || asRecord(block.file)?.name || '',
      size: null,
      number: block.blockNumber || index + 1,
      status: block.status,
      markdown: block.markdown || '',
      proposal: block.proposal || null,
      error: block.error || '',
      lessonId: block.lessonId || null,
    }),
  );

  let activeNodeId = null;
  if (legacy.activeLessonId)
    activeNodeId = nodeId.lesson(toText(legacy.activeLessonId));
  else if (asRecord(legacy.editingStructure)?.type === 'module')
    activeNodeId = nodeId.module(toText(asRecord(legacy.editingStructure).id));
  else if (asRecord(legacy.editingStructure)?.id)
    activeNodeId = nodeId.lesson(toText(asRecord(legacy.editingStructure).id));
  else if (legacy.chatBlockId || legacy.editingBlockId)
    activeNodeId = nodeId.material(
      toText(legacy.chatBlockId || legacy.editingBlockId),
    );

  return sanitizeDraft({
    course: legacy.createdCourse || null,
    courseForm: legacy.courseDraft || EMPTY_COURSE_FORM,
    materials,
    lessons,
    modules,
    positions: {},
    activeNodeId,
    inspector: {
      open: Boolean(activeNodeId),
      tab: legacy.chatBlockId ? 'ai' : null,
    },
    onboardingDismissed: Boolean(asRecord(legacy.createdCourse)?.id),
  });
}

export function loadDraft(): { draft: DndDraft; migrated: boolean } {
  const storage = getLocalStorage();
  if (!storage) return { draft: { ...EMPTY_DRAFT }, migrated: false };

  try {
    const current: unknown = JSON.parse(storage.getItem(DRAFT_KEY) || 'null');
    if (current && typeof current === 'object') {
      return { draft: sanitizeDraft(asRecord(current)), migrated: false };
    }
  } catch {
    // Повреждённый черновик игнорируем и пробуем старый формат.
  }

  try {
    const legacy: unknown = JSON.parse(
      storage.getItem(LEGACY_DRAFT_KEY) || 'null',
    );
    if (legacy && typeof legacy === 'object') {
      const draft = migrateLegacyDraft(asRecord(legacy));
      // Старый ключ удаляем только после того, как новый точно записан.
      if (saveDraft(draft)) storage.removeItem(LEGACY_DRAFT_KEY);
      return { draft, migrated: true };
    }
  } catch {
    // Старый черновик нечитаем — начинаем с чистого листа.
  }

  return { draft: { ...EMPTY_DRAFT }, migrated: false };
}

export function pickDraft(state: DndDraft): DndDraft {
  const draft: RawApiRecord = {};
  for (const key of PERSISTED_KEYS) draft[key] = state[key];
  draft.materials = (state.materials || []).map(
    ({ attachToLessonId, ...material }) => material,
  );
  return draft as unknown as DndDraft;
}

export function saveDraft(state: DndDraft): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(
      DRAFT_KEY,
      JSON.stringify({ version: 2, ...pickDraft(state) }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearDraft({ includeLegacy = true } = {}) {
  const storage = getLocalStorage();
  try {
    storage?.removeItem(DRAFT_KEY);
    if (includeLegacy) storage?.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // ничего страшного: черновик просто останется
  }
}
