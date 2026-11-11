import { asRecords, asRecord, asArray } from '@/shared/api';
import { toText } from '@/shared/lib/text';
import {
  courseLevelToDifficulty,
  difficultyToCourseLevel,
  formatCourseLevel,
} from '../model/levels';
import type {
  CoursesPage,
  LearningBlock,
  LearningCourse,
  LearningLesson,
  PageParams,
  RawApiRecord,
} from '../model/types';
import {
  lessonMarkdownFromBlocks,
  normalizeTheoryContentBlocks,
  sanitizeContentBlock,
} from './content-blocks';

export function parseMinutes(value: unknown): number | null {
  const match = /(\d+)/.exec(toText(value || ''));
  return match ? Number(match[1]) : null;
}

function blocksToPayload(blocks: RawApiRecord[] | null | undefined) {
  return (blocks || []).map((block) => ({
    title: block.title || '',
    description: block.description || '',
    duration: block.duration || '',
    learning_objectives: block.learningObjectives || [],
    lessons: asRecords(block.lessons || []).map((lesson: RawApiRecord) => ({
      title: lesson.title || '',
      description: lesson.summary || '',
      estimated_time_minutes: parseMinutes(lesson.duration),
      learning_objectives: [],
      content_blocks: lesson.contentBlocks
        ? asRecords(lesson.contentBlocks).map(sanitizeContentBlock)
        : lesson.markdown
          ? [
              {
                content_type: 'text',
                md_content: lesson.markdown,
                ai_generated: false,
              },
            ]
          : [],
    })),
  }));
}

export function buildCoursePayload(course: RawApiRecord) {
  return {
    title: course.title || 'Новый курс',
    description: course.description || '',
    difficulty: courseLevelToDifficulty(course.level),
    category: course.category || '',
    duration: course.duration || '',
    format: course.format || '',
    learning_objectives: course.learningObjectives || [],
    tags: course.tags || [],
    modules: blocksToPayload(asRecords(course.blocks)),
  };
}

export function readCourseModules(
  data: RawApiRecord | null | undefined,
): Array<RawApiRecord | string> {
  const modules =
    data?.modules ||
    data?.course_modules ||
    data?.courseModules ||
    data?.module_ids ||
    data?.moduleIds ||
    data?.modules_ids ||
    data?.moduleIdsList ||
    [];

  return asArray(modules).filter(
    (item): item is RawApiRecord | string =>
      typeof item === 'string' ||
      (item !== null && typeof item === 'object' && !Array.isArray(item)),
  );
}

function getModuleId(
  data: RawApiRecord | string | null | undefined,
  fallbackId?: string,
): string {
  if (!data || typeof data !== 'object') {
    // Исторически id мог остаться пустым — вызывающий код это учитывает.
    return fallbackId as string;
  }

  return toText(
    data.module_id ||
      data.moduleId ||
      data.module_uuid ||
      data.moduleUuid ||
      data.uuid ||
      asRecord(data.module)?.id ||
      asRecord(data.module)?.module_id ||
      asRecord(data.module)?.moduleId ||
      asRecord(data.data)?.module_id ||
      asRecord(data.data)?.moduleId ||
      asRecord(data.data)?.id ||
      data.id ||
      fallbackId,
  );
}

export function normalizeModuleRef(value: unknown): RawApiRecord {
  const module = typeof value === 'string' ? value : asRecord(value);
  if (typeof module === 'string') {
    return { id: module };
  }

  if (module?.module) {
    return normalizeModuleRef(module.module);
  }

  const id = getModuleId(module);
  return {
    ...module,
    id,
  };
}

function readModuleLessons(
  data: RawApiRecord | null | undefined,
): Array<RawApiRecord | string> {
  const lessons =
    data?.lessons ||
    data?.module_lessons ||
    data?.moduleLessons ||
    data?.lesson_ids ||
    data?.lessonIds ||
    data?.lessons_ids ||
    [];

  return asArray(lessons).filter(
    (item): item is RawApiRecord | string =>
      typeof item === 'string' ||
      (item !== null && typeof item === 'object' && !Array.isArray(item)),
  );
}

export function normalizeLessonRef(value: unknown): RawApiRecord {
  const lesson = typeof value === 'string' ? value : asRecord(value);
  if (typeof lesson === 'string') {
    return { id: lesson };
  }

  if (lesson?.lesson) {
    return normalizeLessonRef(lesson.lesson);
  }

  const id = lesson?.id || lesson?.lesson_id || lesson?.lessonId;
  return {
    ...lesson,
    id,
  };
}

/** Полный курс с модулями и уроками → модель интерфейса. */
export function mapCourseFromApi(data: RawApiRecord): LearningCourse {
  const blocks = readCourseModules(data).map(
    (rawModule, moduleIndex): LearningBlock => {
      const module = normalizeModuleRef(rawModule);
      return {
        id: toText(module.id),
        title: toText(module.title || 'Модуль без названия'),
        description: toText(module.description || ''),
        order: Number(
          Number.isFinite(module.order) ? module.order : moduleIndex,
        ),
        duration: toText(module.duration || 'Модуль курса'),
        learningObjectives: asArray(
          module.learning_objectives || module.learningObjectives || [],
        ).map(toText),
        learning_objectives: asArray(
          module.learning_objectives || module.learningObjectives || [],
        ).map(toText),
        lessons: readModuleLessons(module).map(
          (rawLesson, lessonIndex): LearningLesson => {
            const lesson = normalizeLessonRef(rawLesson);
            const contentBlocks = normalizeTheoryContentBlocks(
              lesson.content_blocks ||
                lesson.contentBlocks ||
                lesson.blocks ||
                [],
            );
            return {
              id: toText(lesson.id),
              title: toText(lesson.title || 'Урок без названия'),
              duration: Number.isFinite(lesson.estimated_time_minutes)
                ? `${toText(lesson.estimated_time_minutes)} мин.`
                : 'Материал урока',
              summary: toText(lesson.description || ''),
              description: toText(lesson.description || ''),
              content: lessonMarkdownFromBlocks(contentBlocks),
              markdown: lessonMarkdownFromBlocks(contentBlocks),
              contentBlocks,
              content_blocks: contentBlocks,
              order: Number(
                Number.isFinite(lesson.order) ? lesson.order : lessonIndex,
              ),
              learningObjectives: asArray(
                lesson.learning_objectives || lesson.learningObjectives || [],
              ).map(toText),
              learning_objectives: asArray(
                lesson.learning_objectives || lesson.learningObjectives || [],
              ).map(toText),
            };
          },
        ),
        practice: [],
      };
    },
  );

  return {
    ...data,
    id: toText(data.id),
    title: toText(data.title || ''),
    category: toText(data.category || ''),
    description: toText(data.description || ''),
    duration: toText(data.duration || ''),
    level: difficultyToCourseLevel(data.difficulty),
    difficulty: toText(
      data.difficulty || difficultyToCourseLevel(data.difficulty),
    ),
    format: toText(data.format || ''),
    tags: asArray(data.tags || []).map(toText),
    learningObjectives: asArray(
      data.learning_objectives || data.learningObjectives || [],
    ).map(toText),
    learning_objectives: asArray(
      data.learning_objectives || data.learningObjectives || [],
    ).map(toText),
    blocks,
    modules: blocks,
  };
}

export function courseChangesToPatch(changes: RawApiRecord): RawApiRecord {
  const patch: RawApiRecord = {};
  if ('title' in changes) patch.title = changes.title;
  if ('description' in changes) patch.description = changes.description;
  if ('tags' in changes) patch.tags = changes.tags;
  if ('level' in changes)
    patch.difficulty = courseLevelToDifficulty(changes.level);
  if ('difficulty' in changes) patch.difficulty = changes.difficulty;
  return patch;
}

export function moduleChangesToPatch(changes: RawApiRecord): RawApiRecord {
  const patch: RawApiRecord = {};
  if ('title' in changes) patch.title = changes.title;
  if ('description' in changes) patch.description = changes.description;
  if ('order' in changes) patch.order = changes.order;
  if ('learningObjectives' in changes) {
    patch.learning_objectives = changes.learningObjectives;
  }
  if ('learning_objectives' in changes) {
    patch.learning_objectives = changes.learning_objectives;
  }
  return patch;
}

export function lessonChangesToPatch(changes: RawApiRecord): RawApiRecord {
  const patch: RawApiRecord = {};
  if ('title' in changes) patch.title = changes.title;
  if ('description' in changes) patch.description = changes.description;
  if ('summary' in changes) patch.description = changes.summary;
  if ('order' in changes) patch.order = changes.order;
  if ('learningObjectives' in changes) {
    patch.learning_objectives = changes.learningObjectives;
  }
  if ('learning_objectives' in changes) {
    patch.learning_objectives = changes.learning_objectives;
  }
  if ('estimatedTimeMinutes' in changes) {
    patch.estimated_time_minutes = changes.estimatedTimeMinutes;
  }
  if ('estimated_time_minutes' in changes) {
    patch.estimated_time_minutes = changes.estimated_time_minutes;
  }
  if ('duration' in changes)
    patch.estimated_time_minutes = parseMinutes(changes.duration);
  if ('contentBlocks' in changes) {
    patch.content_blocks = asRecords(changes.contentBlocks || []).map(
      sanitizeContentBlock,
    );
  } else if ('content_blocks' in changes) {
    patch.content_blocks = asRecords(changes.content_blocks || []).map(
      sanitizeContentBlock,
    );
  } else if ('markdown' in changes) {
    patch.content_blocks = changes.markdown
      ? [
          {
            content_type: 'text',
            md_content: changes.markdown,
            ai_generated: false,
          },
        ]
      : [];
  }
  return patch;
}

/** Курс из краткого ответа (без вложенных уроков) → модель интерфейса. */
export function courseBasicToLearningCourse(
  data: RawApiRecord,
): LearningCourse {
  const blocks = readCourseModules(data).map(
    (rawModule, moduleIndex): LearningBlock => {
      const module = normalizeModuleRef(rawModule);
      return {
        id: toText(module.id),
        title: toText(module.title || 'Модуль без названия'),
        description: toText(module.description || ''),
        order: Number(
          Number.isFinite(module.order) ? module.order : moduleIndex,
        ),
        duration: toText(module.duration || 'Модуль курса'),
        learningObjectives: asArray(
          module.learning_objectives || module.learningObjectives || [],
        ).map(toText),
        learning_objectives: asArray(
          module.learning_objectives || module.learningObjectives || [],
        ).map(toText),
        lessons: readModuleLessons(module).map((lesson, lessonIndex) =>
          lessonBasicToLearningLesson(normalizeLessonRef(lesson), {
            order: lessonIndex,
          }),
        ),
        practice: [],
      };
    },
  );

  return {
    ...data,
    category: data.category || '',
    duration: data.duration || 'По индивидуальному темпу',
    level: data.difficulty ? formatCourseLevel(data.difficulty) : 'Не указан',
    difficulty: data.difficulty || data.level || 'Не указан',
    format: data.format || 'Теория + практика',
    learningObjectives:
      data.learning_objectives || data.learningObjectives || [],
    learning_objectives:
      data.learning_objectives || data.learningObjectives || [],
    blocks,
    modules: blocks,
    // Поля id, title и т. д. приходят из ...data — TS их не видит.
  } as unknown as LearningCourse;
}

export function moduleBasicToLearningBlock(
  data: RawApiRecord | string,
  currentBlock: RawApiRecord = {},
): LearningBlock {
  if (typeof data === 'string') {
    return {
      ...currentBlock,
      id: data,
      title: toText(currentBlock.title || 'Модуль без названия'),
      description: toText(currentBlock.description || ''),
      order: Number(currentBlock.order || 0),
      duration: toText(currentBlock.duration || 'Модуль курса'),
      learningObjectives: asArray(currentBlock.learningObjectives || []).map(
        toText,
      ),
      learning_objectives: asArray(currentBlock.learning_objectives || []).map(
        toText,
      ),
      lessons: asRecords(currentBlock.lessons).map((lesson) =>
        lessonBasicToLearningLesson(lesson),
      ),
      practice: asRecords(currentBlock.practice).map((item) => ({
        ...item,
        id: toText(item.id),
      })),
    };
  }

  const learningObjectives =
    data.learning_objectives || data.learningObjectives || [];
  return {
    ...currentBlock,
    id: getModuleId(data, toText(currentBlock.id)),
    title: toText(data.title || 'Модуль без названия'),
    description: toText(data.description || ''),
    order: Number(
      Number.isFinite(data.order) ? data.order : currentBlock.order || 0,
    ),
    duration: toText(data.duration || currentBlock.duration || 'Модуль курса'),
    learningObjectives: asArray(learningObjectives).map(toText),
    learning_objectives: asArray(learningObjectives).map(toText),
    lessons: readModuleLessons(data).map((lesson, lessonIndex) =>
      lessonBasicToLearningLesson(normalizeLessonRef(lesson), {
        order: lessonIndex,
      }),
    ),
    practice: asRecords(currentBlock.practice).map((item) => ({
      ...item,
      id: toText(item.id),
    })),
  };
}

export function lessonBasicToLearningLesson(
  data: RawApiRecord,
  currentLesson: RawApiRecord = {},
): LearningLesson {
  const contentBlocks = normalizeTheoryContentBlocks(
    data.content_blocks ||
      data.contentBlocks ||
      currentLesson.contentBlocks ||
      [],
  );
  const markdown = lessonMarkdownFromBlocks(contentBlocks);
  const learningObjectives =
    data.learning_objectives || data.learningObjectives || [];
  return {
    ...currentLesson,
    id: toText(data.id),
    title: toText(data.title || 'Урок без названия'),
    duration: toText(
      Number.isFinite(data.estimated_time_minutes)
        ? `${toText(data.estimated_time_minutes)} мин.`
        : currentLesson.duration || 'Время не указано',
    ),
    summary: toText(data.description || ''),
    description: toText(data.description || ''),
    content: toText(
      markdown || data.description || currentLesson.content || '',
    ),
    markdown: toText(markdown || currentLesson.markdown || ''),
    contentBlocks,
    content_blocks: contentBlocks,
    order: Number(
      Number.isFinite(data.order) ? data.order : currentLesson.order || 0,
    ),
    learningObjectives: asArray(learningObjectives).map(toText),
    learning_objectives: asArray(learningObjectives).map(toText),
  };
}

export function normalizePaginatedResponse(
  data: RawApiRecord | null | undefined,
  { page = 1, size = 20 }: PageParams = {},
): CoursesPage {
  const rawItems = Array.isArray(data)
    ? data
    : data?.items || data?.courses || data?.results || [];
  const items = asRecords(rawItems).map((course: RawApiRecord) =>
    readCourseModules(course).length
      ? mapCourseFromApi(course)
      : courseBasicToLearningCourse(course),
  );
  const totalItems =
    Number(data?.total) ||
    Number(data?.total_items) ||
    Number(data?.count) ||
    (Array.isArray(data) ? data.length : items.length);
  const totalPages =
    Number(data?.total_pages) ||
    Number(data?.pages) ||
    Math.max(1, Math.ceil(totalItems / Math.max(1, size)));

  return {
    ...data,
    items,
    page: Number(data?.page) || page,
    size: Number(data?.size) || size,
    total: totalItems,
    total_pages: totalPages,
    pages: totalPages,
    has_next: Boolean(data?.has_next ?? data?.hasNext ?? page < totalPages),
    has_prev: Boolean(data?.has_prev ?? data?.hasPrev ?? page > 1),
  };
}

export function extractCourseStatus(
  data: RawApiRecord | string | null | undefined,
): string {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  return toText(
    data.status ||
      data.course_status ||
      data.courseStatus ||
      data.state ||
      Object.values(data).find((value) => typeof value === 'string') ||
      '',
  );
}
