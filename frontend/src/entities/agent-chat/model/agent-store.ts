import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  isAgentMockEnabled,
  mockInterviewer,
  type MockAgentKind,
} from "@/shared/lib/agent-mock";
import { getLocalStorage } from "@/shared/lib/storage";
import {
  askEditorAgent,
  askInterviewerAgent,
  askLessonInterviewerAgent,
  askMentorAgent,
  askModuleInterviewerAgent,
} from "../api/agent-api";
import type {
  AgentConversation,
  AgentGenerationState,
  AgentMessage,
  AgentPayload,
  AgentResponse,
  AgentType,
} from "./types";

export interface SendAgentMessageParams {
  key: string;
  agent: AgentType;
  courseId: string;
  content: string;
  contentBlocks?: unknown[];
  editorPayload?: AgentPayload;
  emptyResponseMessage?: string;
  /** Текст в истории вместо ответа агента (например, «Генерация запущена»). */
  responseDisplayMessage?: string | ((response: AgentResponse) => string);
}

type GenerationPatch =
  | Partial<AgentGenerationState>
  | ((current: AgentGenerationState) => Partial<AgentGenerationState> | void);

interface AgentState {
  conversations: Record<string, AgentConversation>;
  generations: Record<string, AgentGenerationState>;
  initializeConversation: (params: {
    key: string;
    agent: AgentType;
    courseId: string;
    initialMessage?: string;
  }) => void;
  setChatId: (key: string, chatId: string | null) => void;
  appendMessage: (
    key: string,
    role: AgentMessage["role"],
    text: unknown,
  ) => void;
  removeLastMessage: (key: string, role?: AgentMessage["role"]) => void;
  clearConversation: (key: string) => void;
  cancelRequest: (key: string) => void;
  getGeneration: (key: string) => AgentGenerationState;
  setGeneration: (key: string, patch: GenerationPatch) => void;
  resetGeneration: (key: string) => void;
  sendMessage: (
    params: SendAgentMessageParams,
  ) => Promise<AgentResponse | null>;
}

type PersistedAgentState = Pick<AgentState, "conversations" | "generations">;

// Диалоги интервьюеров (курс, модуль, урок) сохраняются в браузере вместе с chat_id,
// чтобы после перезагрузки страницы можно было продолжить ту же беседу.
// На backend нет ручки чтения истории чата, поэтому история живёт только здесь.
const PERSISTED_AGENTS = new Set<string>([
  "interviewer",
  "module_interviewer",
  "lesson_interviewer",
]);
const MAX_PERSISTED_MESSAGES = 200;
const MAX_PERSISTED_CONVERSATIONS = 30;
const MEMORY_STORAGE = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const MAX_MESSAGE_LENGTH = 10_000;
const REQUEST_TIMEOUT_MS = 120_000;
const requestControllers = new Map<string, AbortController>();
let messageSequence = 0;

function createMessage(
  role: AgentMessage["role"],
  text: unknown,
): AgentMessage {
  messageSequence += 1;
  return {
    id: `agent-message-${Date.now()}-${messageSequence}`,
    role,
    text: String(text),
  };
}

function normalizeUserContent(value: unknown): string {
  const content = String(value ?? "")
    .replace(/\0/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

  if (!content) {
    throw new Error("Введите сообщение.");
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new Error(
      `Сообщение слишком длинное. Максимум — ${MAX_MESSAGE_LENGTH} символов.`,
    );
  }
  return content;
}

function getPublicError(rawError: unknown): string {
  const error = rawError as
    | { status?: number; userMessage?: string; message?: string }
    | null
    | undefined;
  const statusMessages: Record<number, string> = {
    401: "Сессия истекла. Войдите заново.",
    403: "Недостаточно прав для обращения к этому ИИ-агенту.",
    422: "Запрос содержит некорректные данные. Обновите страницу и попробуйте снова.",
    429: "Слишком много запросов. Подождите и попробуйте снова.",
  };
  if (error?.status && statusMessages[error.status]) {
    return statusMessages[error.status];
  }
  if (Number(error?.status) >= 500) {
    return "ИИ-сервис временно недоступен. Попробуйте позже.";
  }
  return (
    error?.userMessage ||
    error?.message ||
    "ИИ-сервис временно недоступен. Попробуйте позже."
  );
}

function getConversation(
  state: PersistedAgentState,
  key: string,
  agent: AgentType,
  courseId: string,
): AgentConversation {
  return (
    state.conversations[key] || {
      agent,
      courseId,
      chatId: null,
      messages: [],
      status: "idle",
      error: "",
      activeRequestId: null,
    }
  );
}

export const createInitialGenerationState = (): AgentGenerationState => ({
  hasStarted: false,
  isGenerating: false,
  taskId: null,
  generatedCourseId: null,
  status: "Жду ответы в чате",
  courseStatus: "",
  progress: 0,
  error: "",
  startedAt: null,
});

function normalizeProgress(value: unknown): number {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

const MOCK_AGENT_KINDS: Partial<Record<AgentType, MockAgentKind>> = {
  interviewer: "course",
  module_interviewer: "module",
  lesson_interviewer: "lesson",
};

function callAgent(
  agent: AgentType,
  payload: AgentPayload,
  options: { signal?: AbortSignal },
): Promise<AgentResponse> {
  // Демо-режим (только dev, ?ai-mock=1): интервьюеры отвечают без LLM.
  const mockKind = MOCK_AGENT_KINDS[agent];
  if (mockKind && isAgentMockEnabled()) {
    return mockInterviewer(mockKind, payload) as Promise<AgentResponse>;
  }
  if (agent === "interviewer") {
    return askInterviewerAgent(payload, options);
  }
  if (agent === "module_interviewer") {
    return askModuleInterviewerAgent(payload, options);
  }
  if (agent === "lesson_interviewer") {
    return askLessonInterviewerAgent(payload, options);
  }
  if (agent === "mentor") {
    return askMentorAgent(payload, options);
  }
  if (agent === "editor") {
    return askEditorAgent(payload, options);
  }
  throw new Error("Неизвестный тип ИИ-агента.");
}

export const createAgentConversationKey = (
  agent: AgentType,
  courseId: string | null | undefined,
  contextId = "",
) => [agent, courseId || "missing-course", contextId].join(":");

function partializeAgentState(state: PersistedAgentState): PersistedAgentState {
  const conversations: PersistedAgentState["conversations"] = {};
  const generations: PersistedAgentState["generations"] = {};
  // Храним только последние диалоги, чтобы localStorage не разрастался.
  Object.entries(state.conversations || {})
    .filter(([, conversation]) => PERSISTED_AGENTS.has(conversation?.agent))
    .slice(-MAX_PERSISTED_CONVERSATIONS)
    .forEach(([key, conversation]) => {
      if (!PERSISTED_AGENTS.has(conversation?.agent)) return;
      conversations[key] = {
        ...conversation,
        messages: (conversation.messages || []).slice(-MAX_PERSISTED_MESSAGES),
        status:
          conversation.status === "loading" ? "idle" : conversation.status,
        activeRequestId: null,
      };
      if (state.generations?.[key]) generations[key] = state.generations[key];
    });
  return { conversations, generations };
}

export const useAgentStore = create<AgentState>()(
  persist<AgentState, [], [], PersistedAgentState>(
    (set, get) => ({
      conversations: {},
      generations: {},

      initializeConversation: ({
        key,
        agent,
        courseId,
        initialMessage = "",
      }) => {
        set((state) => {
          if (state.conversations[key]) return state;
          return {
            conversations: {
              ...state.conversations,
              [key]: {
                agent,
                courseId,
                chatId: null,
                messages: initialMessage
                  ? [createMessage("assistant", initialMessage)]
                  : [],
                status: "idle",
                error: "",
                activeRequestId: null,
              },
            },
          };
        });
      },

      setChatId: (key, chatId) => {
        set((state) => {
          const conversation = state.conversations[key];
          if (!conversation) return state;
          return {
            conversations: {
              ...state.conversations,
              [key]: {
                ...conversation,
                chatId: chatId || null,
              },
            },
          };
        });
      },

      appendMessage: (key, role, text) => {
        if (!String(text ?? "").trim()) return;
        set((state) => {
          const conversation = state.conversations[key];
          if (!conversation) return state;
          return {
            conversations: {
              ...state.conversations,
              [key]: {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  createMessage(role, String(text).trim()),
                ],
              },
            },
          };
        });
      },

      // Убирает последнее сообщение указанной роли (нужно для повторной отправки после ошибки).
      removeLastMessage: (key, role = "user") => {
        set((state) => {
          const conversation = state.conversations[key];
          if (!conversation) return state;
          const index = [...conversation.messages]
            .reverse()
            .findIndex((message) => message.role === role);
          if (index < 0) return state;
          const realIndex = conversation.messages.length - 1 - index;
          return {
            conversations: {
              ...state.conversations,
              [key]: {
                ...conversation,
                messages: conversation.messages.filter(
                  (_, messageIndex) => messageIndex !== realIndex,
                ),
                status: "idle",
                error: "",
              },
            },
          };
        });
      },

      clearConversation: (key) => {
        requestControllers.get(key)?.abort();
        requestControllers.delete(key);
        set((state) => {
          const conversations = { ...state.conversations };
          const generations = { ...state.generations };
          delete conversations[key];
          delete generations[key];
          return { conversations, generations };
        });
      },

      cancelRequest: (key) => {
        requestControllers.get(key)?.abort();
        requestControllers.delete(key);
        set((state) => {
          const conversation = state.conversations[key];
          if (!conversation) return state;
          return {
            conversations: {
              ...state.conversations,
              [key]: {
                ...conversation,
                status: "idle",
                activeRequestId: null,
              },
            },
          };
        });
      },

      getGeneration: (key) =>
        get().generations[key] || createInitialGenerationState(),

      setGeneration: (key, patch) => {
        if (!key) return;
        set((state) => {
          const current =
            state.generations[key] || createInitialGenerationState();
          const nextPatch: Partial<AgentGenerationState> =
            typeof patch === "function" ? patch(current) || {} : { ...patch };
          if (Object.prototype.hasOwnProperty.call(nextPatch, "progress")) {
            nextPatch.progress = normalizeProgress(nextPatch.progress);
          }
          return {
            generations: {
              ...state.generations,
              [key]: {
                ...current,
                ...nextPatch,
              },
            },
          };
        });
      },

      resetGeneration: (key) => {
        if (!key) return;
        set((state) => ({
          generations: {
            ...state.generations,
            [key]: createInitialGenerationState(),
          },
        }));
      },

      sendMessage: async ({
        key,
        agent,
        courseId,
        content,
        contentBlocks = [],
        editorPayload = {},
        emptyResponseMessage = "Агент вернул пустой ответ. Попробуйте ещё раз.",
        responseDisplayMessage,
      }) => {
        const normalizedContent = normalizeUserContent(content);
        if (!courseId) {
          throw new Error("Не указан курс для обращения к ИИ-агенту.");
        }

        requestControllers.get(key)?.abort();
        const controller = new AbortController();
        let didTimeout = false;
        const timeoutId = setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, REQUEST_TIMEOUT_MS);
        requestControllers.set(key, controller);
        const requestId = Date.now() + Math.random();
        const current = getConversation(get(), key, agent, courseId);

        set((state) => ({
          conversations: {
            ...state.conversations,
            [key]: {
              ...current,
              agent,
              courseId,
              messages: [
                ...current.messages,
                createMessage("user", normalizedContent),
              ],
              status: "loading",
              error: "",
              activeRequestId: requestId,
            },
          },
        }));

        try {
          const response = await callAgent(
            agent,
            {
              ...editorPayload,
              chat_id: current.chatId,
              course_id: courseId,
              role: "user",
              content: normalizedContent,
              content_blocks: Array.isArray(contentBlocks) ? contentBlocks : [],
            },
            { signal: controller.signal },
          );
          const latest = get().conversations[key];
          if (latest?.activeRequestId !== requestId) return response;

          const responseText =
            typeof response?.content === "string"
              ? response.content.trim()
              : "";
          const visibleResponseText =
            responseDisplayMessage === undefined
              ? responseText
              : String(
                  typeof responseDisplayMessage === "function"
                    ? responseDisplayMessage(response)
                    : responseDisplayMessage,
                ).trim();
          set((state) => ({
            conversations: {
              ...state.conversations,
              [key]: {
                ...state.conversations[key],
                chatId: response?.chatId || current.chatId,
                messages:
                  visibleResponseText || emptyResponseMessage
                    ? [
                        ...state.conversations[key].messages,
                        createMessage(
                          "assistant",
                          visibleResponseText || emptyResponseMessage,
                        ),
                      ]
                    : state.conversations[key].messages,
                status: "success",
                error: "",
                activeRequestId: null,
              },
            },
          }));
          return response;
        } catch (error) {
          const latest = get().conversations[key];
          if (latest?.activeRequestId !== requestId) return null;
          if (controller.signal.aborted && !didTimeout) return null;

          const errorMessage = didTimeout
            ? "ИИ-сервис не ответил вовремя. Попробуйте отправить сообщение ещё раз."
            : getPublicError(error);
          set((state) => ({
            conversations: {
              ...state.conversations,
              [key]: {
                ...state.conversations[key],
                status: "error",
                error: errorMessage,
                activeRequestId: null,
              },
            },
          }));
          throw error;
        } finally {
          clearTimeout(timeoutId);
          if (requestControllers.get(key) === controller) {
            requestControllers.delete(key);
          }
        }
      },
    }),
    {
      name: "ai-course-agent-chats-v1",
      version: 1,
      storage: createJSONStorage(() => getLocalStorage() || MEMORY_STORAGE),
      partialize: partializeAgentState,
    },
  ),
);
