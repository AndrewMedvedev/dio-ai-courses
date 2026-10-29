// Помощники страницы просмотра курса: поиск модуля по уроку и данные для карточек.
import type {
  LearningBlock,
  LearningCourse,
  LearningLesson,
  LessonBasicInfoData,
} from "@/entities/course";
import type { RawApiRecord } from "@/shared/api";

// В режиме метрик на сводке курса ни один модуль в дереве не выделен.
export const NO_SELECTED_BLOCK = { id: "" };

export function findBlockByLesson(
  course: LearningCourse | null | undefined,
  lessonId: string | null | undefined,
): LearningBlock | null {
  return (
    course?.blocks?.find((block) =>
      block.lessons.some((lesson) => lesson.id === lessonId),
    ) ?? null
  );
}

// Краткая информация о курсе приходит без уроков: подставляем уроки из полной
// структуры, чтобы дерево могло показать прогресс по каждому уроку.
export function mergeCourseLessons(
  course: LearningCourse | null,
  structure: LearningCourse | null | undefined,
): LearningCourse | null {
  if (!course || !structure?.blocks?.length) {
    return course;
  }

  let isChanged = false;
  const blocks = course.blocks.map((block) => {
    const fullBlock = structure.blocks.find((item) => item.id === block.id);
    if (!fullBlock?.lessons?.length || block.lessons?.length) {
      return block;
    }
    isChanged = true;
    return { ...block, lessons: fullBlock.lessons };
  });

  return isChanged ? { ...course, blocks } : course;
}

export function toModuleBasicInfoFromLearningBlock(
  block: LearningBlock | null | undefined,
) {
  if (!block) {
    return null;
  }

  const learningObjectives = Array.isArray(block.learningObjectives)
    ? block.learningObjectives
    : Array.isArray(block.learning_objectives)
      ? block.learning_objectives
      : [];

  return {
    id: block.id,
    title: block.title,
    description: block.description || "",
    order: Number.isFinite(block.order) ? block.order : 0,
    learning_objectives: learningObjectives,
    learningObjectives,
    lessons: (block.lessons || []).map((lesson, lessonIndex) => ({
      id: lesson.id,
      title: lesson.title,
      order: Number.isFinite(lesson.order) ? lesson.order : lessonIndex,
    })),
  };
}

export function toLessonBasicInfoFromLearningLesson(
  lesson: LearningLesson | null | undefined,
): LessonBasicInfoData | null {
  if (!lesson) {
    return null;
  }

  const estimatedTimeMatch = /^([0-9]+)\s*мин\.?$/i.exec(lesson.duration || "");
  const learningObjectives = Array.isArray(lesson.learningObjectives)
    ? lesson.learningObjectives
    : Array.isArray(lesson.learning_objectives)
      ? lesson.learning_objectives
      : [];

  return {
    id: lesson.id,
    title: lesson.title,
    description: lesson.summary || lesson.description || lesson.content || "",
    order: Number.isFinite(lesson.order) ? lesson.order : 0,
    learning_objectives: learningObjectives,
    learningObjectives,
    estimated_time_minutes: estimatedTimeMatch
      ? Number(estimatedTimeMatch[1])
      : null,
  };
}

/** Записи учеников, которые бэкенд кладёт в курс. */
export function getCourseStudents(
  course: LearningCourse | null | undefined,
): RawApiRecord[] {
  return Array.isArray(course?.students) ? course.students : [];
}

/** Автор курса: поле называется по-разному в разных ответах бэкенда. */
export function getCourseCreatorId(
  course: LearningCourse | null | undefined,
): string | undefined {
  const creatorId =
    course?.creator_id ||
    course?.creatorId ||
    course?.author_id ||
    course?.authorId ||
    course?.user_id ||
    course?.userId;
  return creatorId ? String(creatorId) : undefined;
}

/** Текст ошибки загрузки: сообщение исключения или запасной текст. */
export function errorText(error: unknown, fallback: string): string {
  return (error as Error | null)?.message || fallback;
}
