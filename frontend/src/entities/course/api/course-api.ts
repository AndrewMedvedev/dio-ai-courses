import {
  ApiError,
  jsonRequest,
  requestJson,
  type ItemsPage,
  type JsonRequestOptions,
  type RequestOptions,
} from "@/shared/api";
import { withoutEmptyValues } from "@/shared/lib/object";
import { isUuid } from "@/shared/lib/uuid";
import { validateMermaidSource } from "@/shared/ui/mermaid-diagram";
import {
  normalizeTheoryContentBlocks,
  sanitizeContentBlock,
} from "../lib/content-blocks";
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
} from "../lib/mappers";
import type {
  ContentBlock,
  CourseStatusResult,
  CoursesPage,
  LearningBlock,
  LearningCourse,
  LearningLesson,
  PageParams,
  RawApiRecord,
} from "../model/types";

export async function fetchCoursesPage(
  { page = 1, size = 20 }: PageParams = {},
  options: JsonRequestOptions = {},
): Promise<CoursesPage> {
  const data = await jsonRequest(
    "/courses/search",
    "POST",
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
    "/courses/my-courses",
    "POST",
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
    "/courses",
    "POST",
    {
      title: data.title || "Новый курс",
      description: data.description || "",
      difficulty: data.difficulty || "beginner",
      status: data.status || "draft",
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
    throw new ApiError("Некорректный идентификатор курса.", {
      status: 400,
      code: "invalid_course_id",
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
    "PUT",
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
  const query = courseId
    ? `?${new URLSearchParams({ course_id: courseId }).toString()}`
    : "";
  const payload = {
    title: data.title || "Новый модуль",
    description: data.description || "",
    order: Number.isFinite(data.order) ? data.order : 1,
    learning_objectives:
      data.learning_objectives || data.learningObjectives || [],
  };
  const response = await jsonRequest(
    `/modules${query}`,
    "POST",
    payload,
    options,
  );

  const directModule = response?.module || response?.data?.module;
  const courseModules = [
    ...readCourseModules(response),
    ...readCourseModules(response?.data),
  ];
  const createdModule =
    directModule ||
    courseModules.find((module) => {
      const normalized = normalizeModuleRef(module);
      return (
        normalized.title === payload.title ||
        Number(normalized.order) === Number(payload.order)
      );
    }) ||
    courseModules.at(-1) ||
    response?.data ||
    response;

  return moduleBasicToLearningBlock(createdModule, {
    title: payload.title,
    description: payload.description,
    order: payload.order,
    learningObjectives: payload.learning_objectives,
    learning_objectives: payload.learning_objectives,
  });
}

export async function assignModuleToCourse(
  moduleId: string,
  courseId: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return requestJson(
    `/modules/${encodeURIComponent(moduleId)}/courses/${encodeURIComponent(courseId)}`,
    {
      method: "POST",
    },
    options,
  );
}

export async function createLesson(
  data: RawApiRecord,
  options: JsonRequestOptions = {},
): Promise<LearningLesson> {
  const moduleId = data.module_id || data.moduleId;
  const query = moduleId
    ? `?${new URLSearchParams({ module_id: moduleId }).toString()}`
    : "";
  const response = await jsonRequest(
    `/lessons${query}`,
    "POST",
    {
      title: data.title || "Новый урок",
      description: data.description || "",
      order: Number.isFinite(data.order) ? data.order : 1,
      learning_objectives:
        data.learning_objectives || data.learningObjectives || [],
      estimated_time_minutes:
        data.estimated_time_minutes ?? data.estimatedTimeMinutes ?? null,
    },
    options,
  );
  return lessonBasicToLearningLesson(
    normalizeLessonRef(response?.lesson || response),
    {
      title: data.title || "Новый урок",
      description: data.description || "",
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
  return requestJson(
    `/lessons/${encodeURIComponent(lessonId)}/modules/${encodeURIComponent(moduleId)}`,
    {
      method: "POST",
    },
    options,
  );
}

export async function updateModule(
  courseId: string | null | undefined,
  moduleId: string,
  changes: RawApiRecord,
): Promise<LearningBlock | null> {
  const patch = withoutEmptyValues(moduleChangesToPatch(changes));
  if (!Object.keys(patch).length) return null;
  const data = await jsonRequest(
    `/modules/${encodeURIComponent(moduleId)}`,
    "PUT",
    patch,
  );
  return moduleBasicToLearningBlock(data);
}

export async function updateLesson(
  courseId: string | null | undefined,
  lessonId: string,
  changes: RawApiRecord,
): Promise<LearningLesson | null> {
  if (
    "contentBlocks" in changes ||
    "content_blocks" in changes ||
    "markdown" in changes
  ) {
    const contentBlocks =
      "markdown" in changes
        ? lessonChangesToPatch(changes).content_blocks
        : changes.contentBlocks || changes.content_blocks || [];
    return updateLessonContentBlocks(lessonId, contentBlocks);
  }
  const patch = withoutEmptyValues(lessonChangesToPatch(changes));
  if (!Object.keys(patch).length) return null;
  const data = await jsonRequest(
    `/lessons/${encodeURIComponent(lessonId)}`,
    "PUT",
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
        block.content_type === "mermaid" ||
        (block.content_type === "text" &&
          /```mermaid\s*\n/i.test(block.md_content || "")),
    )
  ) {
    for (const [index, block] of payload.entries()) {
      try {
        if (block.content_type === "mermaid") {
          block.md_content = await validateMermaidSource(block.md_content);
        } else if (
          block.content_type === "text" &&
          /```mermaid\s*\n/i.test(block.md_content || "")
        ) {
          const source = block.md_content ?? "";
          const matches = [
            ...source.matchAll(/```mermaid\s*\n([\s\S]*?)\n```/gi),
          ];
          let normalized = "";
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
          `Блок ${index + 1}: ${(error as Error).message || "ошибка Mermaid"}`,
        );
      }
    }
  }
  const data = await jsonRequest(
    `/lessons/${encodeURIComponent(lessonId)}/content-blocks`,
    "PUT",
    payload,
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
    { method: "DELETE" },
    options,
  );
}

export async function deleteLesson(
  lessonId: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return requestJson(
    `/lessons/${encodeURIComponent(lessonId)}`,
    { method: "DELETE" },
    options,
  );
}

export async function fetchCourseStatus(
  courseId: string,
  options: RequestInit = {},
): Promise<CourseStatusResult> {
  const data = await requestJson(
    `/courses/${encodeURIComponent(courseId)}/status`,
    { method: "GET", ...(options || {}) },
  );
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
          block.content_type === "mermaid"
            ? [block.md_content]
            : block.content_type === "text"
              ? [
                  ...String(block.md_content || "").matchAll(
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
            );
          }
        }
      }
    }
  }
  const data = await requestJson(
    `/courses/${encodeURIComponent(courseId)}/status`,
    { method: "PATCH", ...(options || {}) },
  );
  return { raw: data, status: extractCourseStatus(data) || "published" };
}

export async function setCourseInviteOnly(
  courseId: string,
  options: RequestInit = {},
): Promise<CourseStatusResult> {
  const data = await requestJson(
    `/courses/${encodeURIComponent(courseId)}/invite-only`,
    { method: "POST", ...(options || {}) },
  );
  return { raw: data, status: extractCourseStatus(data) || "invite_only" };
}

export async function archiveCourse(
  courseId: string,
  options: RequestInit = {},
): Promise<CourseStatusResult> {
  const data = await requestJson(`/courses/${encodeURIComponent(courseId)}`, {
    method: "DELETE",
    ...(options || {}),
  });
  return { raw: data, status: extractCourseStatus(data) || "archived" };
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
    items,
    page: Number(data?.page) || page,
    size: Number(data?.size) || size,
    total: Number(data?.total) || items.length,
    hasNext: Boolean(data?.has_next ?? data?.hasNext),
  };
}
