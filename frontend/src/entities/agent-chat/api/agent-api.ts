import {
  jsonRequest,
  type JsonRequestOptions,
  type RawApiRecord,
} from "@/shared/api";
import { withoutEmptyValues } from "@/shared/lib/object";
import {
  SUPPORTED_CONTENT_TYPES,
  normalizeContentType,
  sanitizeContentBlock,
} from "@/entities/course/@x/agent-chat";
import type { AgentPayload, AgentResponse } from "../model/types";

function normalizeAgentResponse(
  data: RawApiRecord | null | undefined,
): AgentResponse {
  return {
    ...data,
    chatId: data?.chat_id || data?.chatId || null,
    content: data?.content ?? data?.response?.content ?? "",
  };
}

function toAgentChatPayload(payload: AgentPayload = {}) {
  return withoutEmptyValues({
    chat_id: payload.chat_id || payload.chatId,
    course_id: payload.course_id || payload.courseId,
    role: payload.role || "user",
    content: payload.content ?? payload.message ?? payload.prompt ?? "",
  });
}

export async function askInterviewerAgent(
  payload: AgentPayload,
  options: JsonRequestOptions = {},
): Promise<AgentResponse> {
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
export async function askModuleInterviewerAgent(
  payload: AgentPayload,
  options: JsonRequestOptions = {},
): Promise<AgentResponse> {
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
export async function askLessonInterviewerAgent(
  payload: AgentPayload,
  options: JsonRequestOptions = {},
): Promise<AgentResponse> {
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

export async function askMentorAgent(
  payload: AgentPayload,
  options: JsonRequestOptions = {},
): Promise<AgentResponse> {
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

function normalizeSupportedContentType(value: unknown): string {
  const contentType = normalizeContentType({ content_type: value || "text" });
  return SUPPORTED_CONTENT_TYPES.has(contentType) ? contentType : "text";
}

function normalizeEditorContentBlock(
  contentBlock: unknown,
  fallbackContentType = "text",
): unknown {
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
    const block = contentBlock as RawApiRecord;
    return {
      ...block,
      content_type: normalizeSupportedContentType(
        block.content_type || fallbackContentType || "text",
      ),
      ai_generated:
        typeof block.ai_generated === "boolean" ? block.ai_generated : false,
    };
  }

  return contentBlock;
}

/** ИИ-редактор блока: в parsedContent — блок, если агент вернул JSON. */
export async function askEditorAgent(
  payload: AgentPayload = {},
  options: JsonRequestOptions = {},
): Promise<AgentResponse & { parsedContent: unknown }> {
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
