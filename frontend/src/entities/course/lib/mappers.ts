import {
  courseLevelToDifficulty,
  difficultyToCourseLevel,
  formatCourseLevel,
} from "../model/levels";
import type {
  CoursesPage,
  LearningBlock,
  LearningCourse,
  LearningLesson,
  PageParams,
  RawApiRecord,
} from "../model/types";
import {
  lessonMarkdownFromBlocks,
  normalizeTheoryContentBlocks,
  sanitizeContentBlock,
} from "./content-blocks";

export function parseMinutes(value: unknown): number | null {
  const match = /(\d+)/.exec(String(value || ""));
  return match ? Number(match[1]) : null;
}

function blocksToPayload(blocks: RawApiRecord[] | null | undefined) {
  return (blocks || []).map((block) => ({
    title: block.title || "",
    description: block.description || "",
    duration: block.duration || "",
    learning_objectives: block.learningObjectives || [],
    lessons: (block.lessons || []).map((lesson: RawApiRecord) => ({
      title: lesson.title || "",
      description: lesson.summary || "",
      estimated_time_minutes: parseMinutes(lesson.duration),
      learning_objectives: [],
      content_blocks: lesson.contentBlocks
        ? lesson.contentBlocks.map(sanitizeContentBlock)
        : lesson.markdown
          ? [
              {
                content_type: "text",
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
    title: course.title || "Новый курс",
    description: course.description || "",
    difficulty: courseLevelToDifficulty(course.level),
    category: course.category || "",
    duration: course.duration || "",
    format: course.format || "",
    learning_objectives: course.learningObjectives || [],
    tags: course.tags || [],
    modules: blocksToPayload(course.blocks),
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

  return Array.isArray(modules) ? modules : [];
}

function getModuleId(
  data: RawApiRecord | string | null | undefined,
  fallbackId?: string,
): string {
  if (!data || typeof data !== "object") {
    // Исторически id мог остаться пустым — вызывающий код это учитывает.
    return fallbackId as string;
  }

  return (
    data.module_id ||
    data.moduleId ||
    data.module_uuid ||
    data.moduleUuid ||
    data.uuid ||
    data.module?.id ||
    data.module?.module_id ||
    data.module?.moduleId ||
    data.data?.module_id ||
    data.data?.moduleId ||
    data.data?.id ||
    data.id ||
    fallbackId
  );
}

export function normalizeModuleRef(
  module: RawApiRecord | string | null | undefined,
): RawApiRecord {
  if (typeof module === "string") {
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

  return Array.isArray(lessons) ? lessons : [];
}

export function normalizeLessonRef(
  lesson: RawApiRecord | string | null | undefined,
): RawApiRecord {
  if (typeof lesson === "string") {
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
  const blocks = readCourseModules(data).map((rawModule, moduleIndex) => {
    const module = normalizeModuleRef(rawModule);
    return {
      id: module.id,
      title: module.title || "Модуль без названия",
      description: module.description || "",
      order: Number.isFinite(module.order) ? module.order : moduleIndex,
      duration: module.duration || "Модуль курса",
      learningObjectives:
        module.learning_objectives || module.learningObjectives || [],
      learning_objectives:
        module.learning_objectives || module.learningObjectives || [],
      lessons: readModuleLessons(module).map((rawLesson, lessonIndex) => {
        const lesson = normalizeLessonRef(rawLesson);
        const contentBlocks = normalizeTheoryContentBlocks(
          lesson.content_blocks || lesson.contentBlocks || lesson.blocks || [],
        );
        return {
          id: lesson.id,
          title: lesson.title || "Урок без названия",
          duration: Number.isFinite(lesson.estimated_time_minutes)
            ? `${lesson.estimated_time_minutes} мин.`
            : "Материал урока",
          summary: lesson.description || "",
          description: lesson.description || "",
          content: lessonMarkdownFromBlocks(contentBlocks),
          markdown: lessonMarkdownFromBlocks(contentBlocks),
          contentBlocks,
          content_blocks: contentBlocks,
          order: Number.isFinite(lesson.order) ? lesson.order : lessonIndex,
          learningObjectives:
            lesson.learning_objectives || lesson.learningObjectives || [],
          learning_objectives:
            lesson.learning_objectives || lesson.learningObjectives || [],
        };
      }),
      practice: [],
    };
  });

  return {
    ...data,
    id: data.id,
    title: data.title || "",
    category: data.category || "",
    description: data.description || "",
    duration: data.duration || "",
    level: difficultyToCourseLevel(data.difficulty),
    difficulty: data.difficulty || difficultyToCourseLevel(data.difficulty),
    format: data.format || "",
    tags: data.tags || [],
    learningObjectives:
      data.learning_objectives || data.learningObjectives || [],
    learning_objectives:
      data.learning_objectives || data.learningObjectives || [],
    blocks,
    modules: blocks,
  };
}

export function courseChangesToPatch(changes: RawApiRecord): RawApiRecord {
  const patch: RawApiRecord = {};
  if ("title" in changes) patch.title = changes.title;
  if ("description" in changes) patch.description = changes.description;
  if ("tags" in changes) patch.tags = changes.tags;
  if ("level" in changes)
    patch.difficulty = courseLevelToDifficulty(changes.level);
  if ("difficulty" in changes) patch.difficulty = changes.difficulty;
  return patch;
}

export function moduleChangesToPatch(changes: RawApiRecord): RawApiRecord {
  const patch: RawApiRecord = {};
  if ("title" in changes) patch.title = changes.title;
  if ("description" in changes) patch.description = changes.description;
  if ("order" in changes) patch.order = changes.order;
  if ("learningObjectives" in changes) {
    patch.learning_objectives = changes.learningObjectives;
  }
  if ("learning_objectives" in changes) {
    patch.learning_objectives = changes.learning_objectives;
  }
  return patch;
}

export function lessonChangesToPatch(changes: RawApiRecord): RawApiRecord {
  const patch: RawApiRecord = {};
  if ("title" in changes) patch.title = changes.title;
  if ("description" in changes) patch.description = changes.description;
  if ("summary" in changes) patch.description = changes.summary;
  if ("order" in changes) patch.order = changes.order;
  if ("learningObjectives" in changes) {
    patch.learning_objectives = changes.learningObjectives;
  }
  if ("learning_objectives" in changes) {
    patch.learning_objectives = changes.learning_objectives;
  }
  if ("estimatedTimeMinutes" in changes) {
    patch.estimated_time_minutes = changes.estimatedTimeMinutes;
  }
  if ("estimated_time_minutes" in changes) {
    patch.estimated_time_minutes = changes.estimated_time_minutes;
  }
  if ("duration" in changes)
    patch.estimated_time_minutes = parseMinutes(changes.duration);
  if ("contentBlocks" in changes) {
    patch.content_blocks = (changes.contentBlocks || []).map(
      sanitizeContentBlock,
    );
  } else if ("content_blocks" in changes) {
    patch.content_blocks = (changes.content_blocks || []).map(
      sanitizeContentBlock,
    );
  } else if ("markdown" in changes) {
    patch.content_blocks = changes.markdown
      ? [
          {
            content_type: "text",
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
  const blocks = readCourseModules(data).map((rawModule, moduleIndex) => {
    const module = normalizeModuleRef(rawModule);
    return {
      id: module.id,
      title: module.title || "Модуль без названия",
      description: module.description || "",
      order: Number.isFinite(module.order) ? module.order : moduleIndex,
      duration: module.duration || "Модуль курса",
      learningObjectives:
        module.learning_objectives || module.learningObjectives || [],
      learning_objectives:
        module.learning_objectives || module.learningObjectives || [],
      lessons: readModuleLessons(module).map((lesson, lessonIndex) =>
        lessonBasicToLearningLesson(normalizeLessonRef(lesson), {
          order: lessonIndex,
        }),
      ),
      practice: [],
    };
  });

  return {
    ...data,
    category: data.category || "",
    duration: data.duration || "По индивидуальному темпу",
    level: data.difficulty ? formatCourseLevel(data.difficulty) : "Не указан",
    difficulty: data.difficulty || data.level || "Не указан",
    format: data.format || "Теория + практика",
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
  if (typeof data === "string") {
    return {
      ...currentBlock,
      id: data,
      title: currentBlock.title || "Модуль без названия",
      description: currentBlock.description || "",
      order: currentBlock.order || 0,
      duration: currentBlock.duration || "Модуль курса",
      learningObjectives: currentBlock.learningObjectives || [],
      learning_objectives: currentBlock.learning_objectives || [],
      lessons: currentBlock.lessons || [],
      practice: currentBlock.practice || [],
    };
  }

  const learningObjectives =
    data.learning_objectives || data.learningObjectives || [];
  return {
    ...currentBlock,
    id: getModuleId(data, currentBlock.id),
    title: data.title || "Модуль без названия",
    description: data.description || "",
    order: Number.isFinite(data.order) ? data.order : currentBlock.order || 0,
    duration: data.duration || currentBlock.duration || "Модуль курса",
    learningObjectives,
    learning_objectives: learningObjectives,
    lessons: readModuleLessons(data).map((lesson, lessonIndex) =>
      lessonBasicToLearningLesson(normalizeLessonRef(lesson), {
        order: lessonIndex,
      }),
    ),
    practice: currentBlock.practice || [],
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
    id: data.id,
    title: data.title || "Урок без названия",
    duration: Number.isFinite(data.estimated_time_minutes)
      ? `${data.estimated_time_minutes} мин.`
      : currentLesson.duration || "Время не указано",
    summary: data.description || "",
    description: data.description || "",
    content: markdown || data.description || currentLesson.content || "",
    markdown: markdown || currentLesson.markdown || "",
    contentBlocks,
    content_blocks: contentBlocks,
    order: Number.isFinite(data.order) ? data.order : currentLesson.order || 0,
    learningObjectives,
    learning_objectives: learningObjectives,
  };
}

export function normalizePaginatedResponse(
  data: RawApiRecord | null | undefined,
  { page = 1, size = 20 }: PageParams = {},
): CoursesPage {
  const rawItems = Array.isArray(data)
    ? data
    : data?.items || data?.courses || data?.results || [];
  const items = rawItems.map((course: RawApiRecord) =>
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
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";
  return (
    data.status ||
    data.course_status ||
    data.courseStatus ||
    data.state ||
    Object.values(data).find((value) => typeof value === "string") ||
    ""
  );
}
