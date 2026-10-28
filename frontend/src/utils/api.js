import {
  ApiError,
  apiFetch,
  createApiError,
  jsonRequest,
  requestJson,
} from "@/shared/api";
import {
  SUPPORTED_CONTENT_TYPES,
  normalizeContentType,
  sanitizeContentBlock,
} from "@/entities/course";
import { withoutEmptyValues } from "@/shared/lib/object";

export const DOCUMENT_MAX_SIZE_BYTES = 30 * 1024 * 1024;
export const DOCUMENT_ALLOWED_EXTENSION =
  /\.(pdf|docx|pptx|xlsx|md|html|txt|json)$/i;
export const DOCUMENT_ALLOWED_EXTENSIONS_LABEL =
  ".pdf, .docx, .pptx, .xlsx, .md, .html, .txt и .json";

function validateDocumentFile(file) {
  if (!file) {
    throw new ApiError("Выберите файл для загрузки.", { status: 400 });
  }
  if (!DOCUMENT_ALLOWED_EXTENSION.test(file.name || "")) {
    throw new ApiError(
      `Поддерживаются файлы ${DOCUMENT_ALLOWED_EXTENSIONS_LABEL}.`,
      { status: 400 },
    );
  }
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
    throw new ApiError("Размер файла не должен превышать 30 МБ.", {
      status: 413,
    });
  }
}

async function sendDocument(path, file) {
  validateDocumentFile(file);
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch(path, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw await createApiError(response, "Ошибка загрузки документа");
  }

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json")
    ? response.json()
    : response.text();
}

export async function uploadDocument(file) {
  return sendDocument("/documents/to/markdown", file);
}

export async function convertDocumentToMarkdown(file) {
  return sendDocument("/documents/to/markdown", file);
}

export async function saveDocument(file) {
  return sendDocument("/documents/upload", file);
}

function normalizeAgentResponse(data) {
  return {
    ...data,
    chatId: data?.chat_id || data?.chatId || null,
    content: data?.content ?? data?.response?.content ?? "",
  };
}

function normalizeCreatedPracticeResponse(data) {
  const practice = data?.practice || data?.assignment || data?.test || data;
  return {
    practice,
    practiceId: data?.practice_id || data?.practiceId || data?.id || null,
    raw: data,
  };
}

function appendPracticeAssignmentFormFields(formData, assignment = {}) {
  formData.append("practice", JSON.stringify(assignment));
}

export async function generateLessonTest(moduleId, lessonId, options = {}) {
  return normalizeCreatedPracticeResponse(
    await requestJson(
      `/agent/tests/${encodeURIComponent(moduleId)}/${encodeURIComponent(lessonId)}`,
      { method: "POST", ...(options || {}) },
    ),
  );
}

export async function checkLessonTest(practiceId, payload, options = {}) {
  return jsonRequest(
    `/agent/check/tests/${encodeURIComponent(practiceId)}`,
    "POST",
    payload,
    options,
  );
}

export async function generateLessonPractice(moduleId, lessonId, options = {}) {
  return normalizeCreatedPracticeResponse(
    await requestJson(
      `/agent/practices/${encodeURIComponent(moduleId)}/${encodeURIComponent(lessonId)}`,
      { method: "POST", ...(options || {}) },
    ),
  );
}

export async function checkLessonPractice(
  practiceId,
  assignment,
  file,
  options = {},
) {
  const formData = new FormData();
  appendPracticeAssignmentFormFields(formData, assignment);
  formData.append("file", file);

  const response = await apiFetch(
    `/agent/check/practices/${encodeURIComponent(practiceId)}`,
    { method: "POST", body: formData, ...(options || {}) },
  );

  if (!response.ok) {
    throw await createApiError(
      response,
      "Не удалось проверить практическое задание.",
    );
  }

  return response.json();
}

function toAgentChatPayload(payload = {}) {
  return withoutEmptyValues({
    chat_id: payload.chat_id || payload.chatId,
    course_id: payload.course_id || payload.courseId,
    role: payload.role || "user",
    content: payload.content ?? payload.message ?? payload.prompt ?? "",
  });
}

export async function askInterviewerAgent(payload, options = {}) {
  return normalizeAgentResponse(
    await jsonRequest(
      "/agent/course/interviewer",
      "POST",
      toAgentChatPayload(payload),
      options,
    ),
  );
}

// Интервьюер модуля: собирает требования к новому модулю курса и по подтверждению
// пользователя сам ставит генерацию в очередь (в ответе content = { task_id }).
export async function askModuleInterviewerAgent(payload, options = {}) {
  return normalizeAgentResponse(
    await jsonRequest(
      "/agent/module/interviewer",
      "POST",
      {
        ...toAgentChatPayload(payload),
        order: Math.max(1, Number(payload.order) || 1),
      },
      options,
    ),
  );
}

// Интервьюер урока: то же для нового урока внутри модуля.
export async function askLessonInterviewerAgent(payload, options = {}) {
  return normalizeAgentResponse(
    await jsonRequest(
      "/agent/lesson/interviewer",
      "POST",
      {
        ...toAgentChatPayload(payload),
        module_id: payload.module_id || payload.moduleId,
        order: Math.max(1, Number(payload.order) || 1),
      },
      options,
    ),
  );
}

export async function askMentorAgent(payload, options = {}) {
  return normalizeAgentResponse(
    await jsonRequest(
      "/agent/mentor",
      "POST",
      {
        ...toAgentChatPayload(payload),
        content_blocks: Array.isArray(payload.content_blocks)
          ? payload.content_blocks
          : [],
      },
      options,
    ),
  );
}

function normalizeSupportedContentType(value) {
  const contentType = normalizeContentType({ content_type: value || "text" });
  return SUPPORTED_CONTENT_TYPES.has(contentType) ? contentType : "text";
}

function normalizeEditorContentBlock(
  contentBlock,
  fallbackContentType = "text",
) {
  if (!contentBlock) return contentBlock;

  if (typeof contentBlock === "string") {
    try {
      const parsed = JSON.parse(contentBlock);
      return JSON.stringify({
        ...parsed,
        content_type: normalizeSupportedContentType(
          parsed?.content_type || fallbackContentType || "text",
        ),
        ai_generated:
          typeof parsed?.ai_generated === "boolean"
            ? parsed.ai_generated
            : false,
      });
    } catch {
      return JSON.stringify({
        content_type: normalizeSupportedContentType(fallbackContentType),
        ai_generated: false,
        md_content: contentBlock,
      });
    }
  }

  if (typeof contentBlock === "object") {
    return {
      ...contentBlock,
      content_type: normalizeSupportedContentType(
        contentBlock.content_type || fallbackContentType || "text",
      ),
      ai_generated:
        typeof contentBlock.ai_generated === "boolean"
          ? contentBlock.ai_generated
          : false,
    };
  }

  return contentBlock;
}

export async function askEditorAgent(payload = {}, options = {}) {
  const images = Array.isArray(payload.images)
    ? payload.images.filter(Boolean).slice(0, 3)
    : [];
  const contentType = normalizeSupportedContentType(payload.content_type);
  const requestPayload = withoutEmptyValues({
    ...toAgentChatPayload(payload),
    content_type: contentType,
    content_block: normalizeEditorContentBlock(
      payload.content_block,
      contentType,
    ),
    content_blocks: Array.isArray(payload.content_blocks)
      ? payload.content_blocks.map(sanitizeContentBlock)
      : [],
    images: images.length > 0 ? images : undefined,
  });
  const data = await jsonRequest(
    "/agent/editor",
    "POST",
    requestPayload,
    options,
  );
  console.log("[/agent/editor] response", data);

  const content = data?.content;
  let parsedContent = null;
  if (typeof content === "string" && content.trim()) {
    try {
      parsedContent = JSON.parse(content);
    } catch {
      parsedContent = null;
    }
  }
  return { ...normalizeAgentResponse(data), parsedContent };
}
