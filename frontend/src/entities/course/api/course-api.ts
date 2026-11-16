import {
  getModulePosition,
  getLessonPosition,
  findLessonParent,
  rememberLessonParent,
  serializeCourseChange,
  moveModuleRequest,
  moveLessonRequest,
} from './positions';
import { toText } from '@/shared/lib/text';
import { asRecord, asRecords } from '@/shared/api';
import {
  ApiError,
  jsonRequest,
  requestJson,
  type ItemsPage,
  type JsonRequestOptions,
  type RequestOptions,
} from '@/shared/api';
import { withoutEmptyValues } from '@/shared/lib/object';
import { isUuid } from '@/shared/lib/uuid';
import { validateMermaidSource } from '@/shared/ui/mermaid-diagram';
import {
  normalizeTheoryContentBlocks,
  sanitizeContentBlock,
} from '../lib/content-blocks';
import {
  courseBasicToLearningCourse,
  extractCourseStatus,
  lessonBasicToLearningLesson,
  lessonChangesToPatch,
  mapCourseFromApi,
  moduleBasicToLearningBlock,
  moduleChangesToPatch,
  courseChangesToPatch,
  normalizeLessonRef,
  normalizeModuleRef,
  normalizePaginatedResponse,
  readCourseModules,
} from '../lib/mappers';
import type {
  ContentBlock,
  CourseStatusResult,
  CoursesPage,
  LearningBlock,
  LearningCourse,
  LearningLesson,
  PageParams,
  RawApiRecord,
} from '../model/types';

export async function fetchCoursesPage(
  { page = 1, size = 20 }: PageParams = {},
  options: JsonRequestOptions = {},
): Promise<CoursesPage> {
  const data = await jsonRequest(
    '/courses/search',
    'POST',
    { page, size },
    { ...options, auth: false },
  );
  return normalizePaginatedResponse(data, { page, size });
}

export async function fetchCourses(
  params: PageParams = {},
  options: JsonRequestOptions = {},
): Promise<LearningCourse[]> {
  const response = await fetchCoursesPage(params, options);
  return response.items;
}

export async function fetchMyCoursesPage(
  { page = 1, size = 10 }: PageParams = {},
  options: JsonRequestOptions = {},
): Promise<CoursesPage> {
  const data = await jsonRequest(
    '/courses/my-courses',
    'POST',
    { page, size },
    options,
  );
  return normalizePaginatedResponse(data, { page, size });
}

export async function createCourse(
  data: RawApiRecord,
  options: JsonRequestOptions = {},
): Promise<LearningCourse> {
  const response = await jsonRequest(
    '/courses',
    'POST',
    {
      title: data.title || 'Новый курс',
      description: data.description || '',
      difficulty: data.difficulty || 'beginner',
      status: data.status || 'draft',
      tags: Array.isArray(data.tags) ? data.tags : [],
    },
    options,
  );
  return courseBasicToLearningCourse(response);
}

export async function getCourseBasicInfo(
  courseId: string,
  options: RequestInit = {},
): Promise<LearningCourse> {
  if (!isUuid(courseId)) {
    throw new ApiError('Некорректный идентификатор курса.', {
      status: 400,
      code: 'invalid_course_id',
    });
  }

  const data = await requestJson(
    `/courses/${encodeURIComponent(courseId)}`,
    options,
    { auth: false },
  );
  return courseBasicToLearningCourse(data);
}

export async function getCourse(
  courseId: string,
  options: RequestInit = {},
): Promise<LearningCourse> {
  return getCourseBasicInfo(courseId, options);
}

export async function getModuleBasicInfo(
  moduleId: string,
  options: RequestInit = {},
): Promise<LearningBlock> {
  // Бэкенд проверяет права на модуль через курс, поэтому запрос нужен с токеном.
  const data = await requestJson(
    `/modules/${encodeURIComponent(moduleId)}`,
    options,
  );
  return moduleBasicToLearningBlock(data);
}

export async function getLessonBasicInfo(
  lessonId: string,
  options: RequestInit = {},
): Promise<LearningLesson> {
  const data = await requestJson(
    `/lessons/${encodeURIComponent(lessonId)}`,
    options,
  );
  return lessonBasicToLearningLesson(data);
}

export async function getLessonTheory(
  lessonId: string,
  options: RequestInit = {},
): Promise<ContentBlock[]> {
  const data = await requestJson(
    `/lessons/${encodeURIComponent(lessonId)}/theory`,
    options,
  );
  return normalizeTheoryContentBlocks(data);
}

export async function updateCourse(
  courseId: string,
  changes: RawApiRecord,
): Promise<LearningCourse | null> {
  const patch = withoutEmptyValues(courseChangesToPatch(changes));
  if (!Object.keys(patch).length) return null;
  const data = await jsonRequest(
    `/courses/${encodeURIComponent(courseId)}`,
    'PUT',
    patch,
  );
  return data?.modules
    ? mapCourseFromApi(data)
    : courseBasicToLearningCourse(data);
}

export async function createModule(
  courseId: string | null | undefined,
  data: RawApiRecord,
  options: JsonRequestOptions = {},
): Promise<LearningBlock> {
  if (!courseId) throw new Error('Для создания модуля нужен курс.');
  const position = await getModulePosition(courseId, Number(data.order));
  const payload = {
    title: data.title || 'Новый модуль',
    description: data.description || '',
    position,
    learning_objectives:
      data.learning_objectives || data.learningObjectives || [],
  };
  const response = await jsonRequest(
    `/modules/${encodeURIComponent(courseId)}`,
    'POST',
    payload,
    options,
  );

  const directModule = response?.module || asRecord(response?.data)?.module;
  const courseModules = [
    ...readCourseModules(response),
    ...readCourseModules(asRecord(response?.data)),
  ];
  const createdModule =
    directModule ||
    courseModules.find((module) => {
      const normalized = normalizeModuleRef(module);
      return (
        normalized.title === payload.title ||
        Number(normalized.order) === Number(data.order)
      );
    }) ||
    courseModules.at(-1) ||
    response?.data ||
    response;

  return moduleBasicToLearningBlock(asRecord(createdModule), {
    title: payload.title,
    description: payload.description,
    order: Number.isFinite(data.order) ? Number(data.order) : 1,
    learningObjectives: payload.learning_objectives,
    learning_objectives: payload.learning_objectives,
  });
}

export async function assignModuleToCourse(
  moduleId: string,
  courseId: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return moveModuleRequest(moduleId, courseId, {}, options);
}

export async function createLesson(
  data: RawApiRecord,
  options: JsonRequestOptions = {},
): Promise<LearningLesson> {
  const moduleId = data.module_id || data.moduleId;
  if (!moduleId) throw new Error('Для создания урока нужен модуль.');
  const position = await getLessonPosition(
    toText(moduleId),
    Number(data.order),
  );
  const response = await jsonRequest(
    `/lessons/${encodeURIComponent(toText(moduleId))}`,
    'POST',
    {
      title: data.title || 'Новый урок',
      description: data.description || '',
      position,
      learning_objectives:
        data.learning_objectives || data.learningObjectives || [],
      estimated_time_minutes:
        data.estimated_time_minutes ?? data.estimatedTimeMinutes ?? null,
    },
    options,
  );
  rememberLessonParent(String(response.id), toText(moduleId));
  return lessonBasicToLearningLesson(
    normalizeLessonRef(asRecord(response?.lesson || response)),
    {
      title: data.title || 'Новый урок',
      description: data.description || '',
      order: Number.isFinite(data.order) ? data.order : 1,
      learningObjectives:
        data.learning_objectives || data.learningObjectives || [],
      learning_objectives:
        data.learning_objectives || data.learningObjectives || [],
    },
  );
}

export async function assignLessonToModule(
  lessonId: string,
  moduleId: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return moveLessonRequest(lessonId, moduleId, {}, options);
}

export async function updateModule(
  courseId: string | null | undefined,
  moduleId: string,
  changes: RawApiRecord,
): Promise<LearningBlock | null> {
  if ('order' in changes) {
    if (!courseId) throw new Error('Для перестановки нужен курс.');
    return serializeCourseChange(courseId, async () => {
      const position = await getModulePosition(
        courseId,
        Number(changes.order),
        moduleId,
      );
      const moved = await moveModuleRequest(moduleId, courseId, position);
      const { order: _order, ...fields } = changes;
      const updated = Object.keys(fields).length
        ? await updateModule(courseId, moduleId, fields)
        : null;
      return (
        updated ||
        moduleBasicToLearningBlock({ ...moved, order: changes.order })
      );
    });
  }

  const patch = withoutEmptyValues(moduleChangesToPatch(changes));
  if (!Object.keys(patch).length) return null;
  const data = await jsonRequest(
    `/modules/${encodeURIComponent(moduleId)}`,
    'PATCH',
    patch,
  );
  return moduleBasicToLearningBlock(data);
}

export async function updateLesson(
  courseId: string | null | undefined,
  lessonId: string,
  changes: RawApiRecord,
): Promise<LearningLesson | null> {
  if ('order' in changes) {
    if (!courseId) throw new Error('Для перестановки нужен курс.');
    return serializeCourseChange(courseId, async () => {
      const parent = await findLessonParent(courseId, lessonId);
      const position = await getLessonPosition(
        parent,
        Number(changes.order),
        lessonId,
      );
      const moved = await moveLessonRequest(lessonId, parent, position);
      const { order: _order, ...fields } = changes;
      const updated = Object.keys(fields).length
        ? await updateLesson(courseId, lessonId, fields)
        : null;
      return (
        updated ||
        lessonBasicToLearningLesson({ ...moved, order: changes.order })
      );
    });
  }

  if (
    'contentBlocks' in changes ||
    'content_blocks' in changes ||
    'markdown' in changes
  ) {
    const contentBlocks =
      'markdown' in changes
        ? lessonChangesToPatch(changes).content_blocks
        : changes.contentBlocks || changes.content_blocks || [];
    return updateLessonContentBlocks(lessonId, contentBlocks);
  }
  const patch = withoutEmptyValues(lessonChangesToPatch(changes));
  if (!Object.keys(patch).length) return null;
  const data = await jsonRequest(
    `/lessons/${encodeURIComponent(lessonId)}`,
    'PATCH',
    patch,
  );
  return lessonBasicToLearningLesson(data);
}

/** Сохраняет блоки урока; Mermaid-диаграммы перед отправкой проверяются и чинятся. */
export async function updateLessonContentBlocks(
  lessonId: string,
  contentBlocks: unknown,
): Promise<LearningLesson> {
  const payload = (Array.isArray(contentBlocks) ? contentBlocks : [])
    .map(sanitizeContentBlock)
    .filter(Boolean);
  if (
    payload.some(
      (block) =>
        block.content_type === 'mermaid' ||
        (block.content_type === 'text' &&
          /```mermaid\s*\n/i.test(block.md_content || '')),
    )
  ) {
    for (const [index, block] of payload.entries()) {
      try {
        if (block.content_type === 'mermaid') {
          block.md_content = await validateMermaidSource(block.md_content);
        } else if (
          block.content_type === 'text' &&
          /```mermaid\s*\n/i.test(block.md_content || '')
        ) {
          const source = block.md_content ?? '';
          const matches = [
            ...source.matchAll(/```mermaid\s*\n([\s\S]*?)\n```/gi),
          ];
          let normalized = '';
          let offset = 0;
          for (const match of matches) {
            normalized += source.slice(offset, match.index);
            normalized += `\`\`\`mermaid\n${await validateMermaidSource(match[1])}\n\`\`\``;
            offset = match.index + match[0].length;
          }
          block.md_content = normalized + source.slice(offset);
        }
      } catch (error) {
        throw new Error(
          `Блок ${index + 1}: ${(error as Error).message || 'ошибка Mermaid'}`,
          { cause: error },
        );
      }
    }
  }
  const data = await jsonRequest(
    `/lessons/${encodeURIComponent(lessonId)}`,
    'PATCH',
    { contentBlocks: payload },
  );
  return lessonBasicToLearningLesson({
    id: lessonId,
    content_blocks: payload,
    ...(data || {}),
  });
}

export async function deleteModule(
  moduleId: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return requestJson(
    `/modules/${encodeURIComponent(moduleId)}`,
    { method: 'DELETE' },
    options,
  );
}

export async function deleteLesson(
  lessonId: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return requestJson(
    `/lessons/${encodeURIComponent(lessonId)}`,
    { method: 'DELETE' },
    options,
  );
}

export async function fetchCourseStatus(
  courseId: string,
  options: RequestInit = {},
): Promise<CourseStatusResult> {
  const data = await requestJson(`/courses/${encodeURIComponent(courseId)}`, {
    method: 'GET',
    ...(options || {}),
  });
  return { raw: data, status: extractCourseStatus(data) };
}

/** Публикует курс; перед этим проверяет все Mermaid-диаграммы в уроках. */
export async function publishCourse(
  courseId: string,
  options: RequestInit = {},
): Promise<CourseStatusResult> {
  const course = await getCourseBasicInfo(courseId, options);
  for (const module of course.blocks || []) {
    for (const lesson of module.lessons || []) {
      const blocks = await getLessonTheory(lesson.id, options);
      for (const [index, block] of blocks.entries()) {
        const diagrams =
          block.content_type === 'mermaid'
            ? [block.md_content]
            : block.content_type === 'text'
              ? [
                  ...String(block.md_content || '').matchAll(
                    /```mermaid\s*\n([\s\S]*?)\n```/gi,
                  ),
                ].map((match) => match[1])
              : [];
        for (const source of diagrams) {
          try {
            await validateMermaidSource(source);
          } catch (error) {
            throw new Error(
              `Урок «${lesson.title || lesson.id}», блок ${index + 1}: ${(error as Error).message}`,
              { cause: error },
            );
          }
        }
      }
    }
  }
  const data = await requestJson(
    `/courses/${encodeURIComponent(courseId)}/status`,
    { method: 'PATCH', ...(options || {}) },
  );
  return { raw: data, status: extractCourseStatus(data) || 'published' };
}

export async function setCourseInviteOnly(
  courseId: string,
  options: RequestInit = {},
): Promise<CourseStatusResult> {
  const data = await requestJson(
    `/courses/${encodeURIComponent(courseId)}/invite-only`,
    { method: 'POST', ...(options || {}) },
  );
  return { raw: data, status: extractCourseStatus(data) || 'invite_only' };
}

export async function archiveCourse(
  courseId: string,
  options: RequestInit = {},
): Promise<CourseStatusResult> {
  const data = await requestJson(`/courses/${encodeURIComponent(courseId)}`, {
    method: 'DELETE',
    ...(options || {}),
  });
  return { raw: data, status: extractCourseStatus(data) || 'archived' };
}

/** Участники курса (ученики и преподаватели). */
export async function fetchCourseMembersPage(
  courseId: string,
  { page = 1, size = 20 }: PageParams = {},
): Promise<ItemsPage<RawApiRecord>> {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  const data = await requestJson(
    `/members/${encodeURIComponent(courseId)}?${query.toString()}`,
  );
  const items = Array.isArray(data) ? data : data?.items || [];
  return {
    items: asRecords(items),
    page: Number(data?.page) || page,
    size: Number(data?.size) || size,
    total: Number(data?.total) || asRecords(items).length,
    hasNext: Boolean(data?.has_next ?? data?.hasNext),
  };
}

export async function getGenerationSession(
  generationKey: string,
  options: RequestInit = {},
): Promise<{ status: string; generationKey: string }> {
  const data = await requestJson(
    `/generation-sessions/${encodeURIComponent(generationKey)}`,
    options,
  );
  return {
    status: toText(data.status),
    generationKey: toText(data.generationKey || data.generation_key),
  };
}
