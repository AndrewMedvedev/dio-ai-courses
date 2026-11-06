export type AgentType =
  | "interviewer"
  | "module_interviewer"
  | "lesson_interviewer"
  | "editor"
  | "mentor";

export type AgentStatus = "idle" | "loading" | "success" | "error";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface AgentConversation {
  agent: AgentType;
  courseId: string;
  chatId: string | null;
  messages: AgentMessage[];
  status: AgentStatus;
  error: string;
  activeRequestId: number | null;
}

export interface AgentGenerationState {
  hasStarted: boolean;
  isGenerating: boolean;
  taskId: string | null;
  generatedCourseId: string | null;
  status: string;
  courseStatus: string;
  progress: number;
  error: string;
  startedAt: string | null;
}

/** Сообщение агенту; поля в snake_case или camelCase. */
export interface AgentPayload {
  chat_id?: string | null;
  chatId?: string | null;
  course_id?: string;
  courseId?: string;
  module_id?: string;
  moduleId?: string;
  role?: string;
  content?: string;
  message?: string;
  prompt?: string;
  order?: number;
  content_type?: string;
  content_block?: unknown;
  content_blocks?: unknown[];
  images?: unknown[];
  [key: string]: unknown;
}

export interface AgentResponse {
  chatId: string | null;
  content: unknown;
  [key: string]: unknown;
}
