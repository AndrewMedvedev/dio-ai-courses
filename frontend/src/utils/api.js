const SESSION_KEY = "aicolab_session";
const API_BASE = "/api/v1";
const REFRESH_SKEW_SECONDS = 30;

let refreshPromise = null;
let unauthorizedHandler = null;
let tokenChangeHandler = null;
const tokenEventTarget =
  typeof EventTarget !== "undefined" ? new EventTarget() : null;

export class ApiError extends Error {
  constructor(message, { status, code, validationErrors, payload } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.validationErrors = validationErrors || {};
    this.payload = payload;
    this.userMessage = message;
  }
}

function getStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredSession() {
  const storage = getStorage();
  if (!storage) {
    return emptySession();
  }

  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY) || "null");
    return {
      accessToken: value?.accessToken || null,
      refreshToken: value?.refreshToken || null,
      expiresAt: Number(value?.expiresAt) || null,
      membershipId: value?.membershipId || null,
      organizationId: value?.organizationId || null,
    };
  } catch {
    return emptySession();
  }
}

export function saveStoredSession(session) {
  const storage = getStorage();
  if (!storage) return;

  if (!session) {
    storage.removeItem(SESSION_KEY);
    storage.removeItem("user");
    emitTokenChange(emptySession());
    return;
  }

  // Компромисс: backend возвращает bearer-токены в тело ответа, httpOnly cookie
  // здесь недоступны без изменения контракта API. Храним в localStorage для
  // восстановления сессии после перезагрузки; TODO: заменить на httpOnly cookies
  // или in-memory access token + refresh cookie, когда backend поддержит это.
  const nextSession = {
    accessToken: session.accessToken || null,
    refreshToken: session.refreshToken || null,
    expiresAt: Number(session.expiresAt) || null,
    membershipId: session.membershipId || null,
    organizationId: session.organizationId || null,
  };
  storage.setItem(SESSION_KEY, JSON.stringify(nextSession));
  emitTokenChange(nextSession);
}

function emptySession() {
  return {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    membershipId: null,
    organizationId: null,
  };
}

function getTokens() {
  const session = readStoredSession();
  return {
    access: session.accessToken,
    refresh: session.refreshToken,
    expiresAt: session.expiresAt,
  };
}

function emitTokenChange(session) {
  if (typeof tokenChangeHandler === "function") {
    tokenChangeHandler(session);
  }
  tokenEventTarget?.dispatchEvent(new Event("tokenRefreshed"));
}

export function onTokenRefreshed(callback) {
  if (!tokenEventTarget || typeof callback !== "function") {
    return () => {};
  }
  tokenEventTarget.addEventListener("tokenRefreshed", callback);
  return () => tokenEventTarget.removeEventListener("tokenRefreshed", callback);
}

export function isTokenExpired(expiresAt = readStoredSession().expiresAt) {
  return !expiresAt || shouldRefresh(Number(expiresAt));
}

export const tokenStorage = {
  getAccessToken: () => readStoredSession().accessToken,
  getRefreshToken: () => readStoredSession().refreshToken,
  setTokens: (accessToken, refreshToken, expiresAt) => {
    const current = readStoredSession();
    saveStoredSession({
      ...current,
      accessToken,
      refreshToken,
      expiresAt,
    });
  },
  clearTokens: () => saveStoredSession(null),
  isTokenExpired,
};

function saveTokensFromResponse(data) {
  const current = readStoredSession();
  const nextSession = {
    ...current,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
  saveStoredSession(nextSession);
}

function clearTokens() {
  saveStoredSession(null);
}

function shouldRefresh(expiresAt) {
  if (!expiresAt) return false;
  return expiresAt <= Math.floor(Date.now() / 1000) + REFRESH_SKEW_SECONDS;
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function setTokenChangeHandler(handler) {
  tokenChangeHandler = handler;
}

export function isAuthenticated() {
  const { access, refresh, expiresAt } = getTokens();
  return Boolean(access && refresh && expiresAt && !isTokenExpired(expiresAt));
}

function buildRedirectUrl() {
  if (typeof window === "undefined") return "/login";
  const currentPath = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/login") return "/login";
  return `/login?redirect=${encodeURIComponent(currentPath)}`;
}

function handleUnauthorized() {
  clearTokens();
  if (typeof unauthorizedHandler === "function") {
    unauthorizedHandler();
  }

  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign(buildRedirectUrl());
  }
}

async function parseResponsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function collectValidationErrors(payload) {
  if (!payload || typeof payload !== "object") return {};
  const details = Array.isArray(payload.detail) ? payload.detail : [];

  return details.reduce((acc, item) => {
    const loc = Array.isArray(item?.loc) ? item.loc : [];
    const field = loc[loc.length - 1] || "form";
    acc[field] = item?.msg || "Некорректное значение";
    return acc;
  }, {});
}

async function createApiError(response, fallbackMessage) {
  const payload = await parseResponsePayload(response).catch(() => null);
  const apiError =
    payload && typeof payload === "object" ? payload.error : null;
  const detail = typeof payload === "object" ? payload?.detail : payload;
  const statusMessages = {
    400: "Некорректный запрос.",
    401: "Необходимо войти заново.",
    403: "Недостаточно прав для выполнения действия.",
    404: "Запрошенные данные не найдены.",
    413: "Файл слишком большой.",
    422: "Проверьте корректность заполнения полей.",
    500: "Сервис временно недоступен. Попробуйте позже.",
  };
  const message =
    (typeof apiError?.public_message === "string" &&
      apiError.public_message.trim()) ||
    (typeof detail === "string" && detail.trim()) ||
    statusMessages[response.status] ||
    fallbackMessage;

  return new ApiError(message, {
    status: apiError?.status || response.status,
    code: apiError?.code,
    validationErrors:
      response.status === 422 ? collectValidationErrors(payload) : {},
    payload,
  });
}

async function refreshAccessToken() {
  const { refresh } = getTokens();
  if (!refresh) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(refresh),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw await createApiError(response, "Сессия истекла.");
        }
        const data = await response.json();
        saveTokensFromResponse(data);
        return data.access_token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function requestJson(
  path,
  options = {},
  { auth = true, retry = true } = {},
) {
  const response = await apiFetch(path, options, { auth, retry });
  if (!response.ok) {
    throw await createApiError(
      response,
      `Ошибка запроса ${options.method || "GET"} ${path}`,
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function login(credentialsOrEmail, maybePassword) {
  const credentials =
    typeof credentialsOrEmail === "object"
      ? credentialsOrEmail
      : { email: credentialsOrEmail, password: maybePassword };

  return requestJson(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    },
    { auth: false },
  );
}

export async function authenticateWithMembership(body) {
  return requestJson(
    "/auth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { auth: false },
  );
}

export async function logout(tokens) {
  return requestJson(
    "/auth/logout",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens),
    },
    { auth: false, retry: false },
  );
}

export async function apiFetch(
  path,
  options = {},
  { auth = true, retry = true } = {},
) {
  const url = `${API_BASE}${path}`;
  const headers = { ...options.headers };
  let { access, expiresAt } = getTokens();

  if (auth && access && shouldRefresh(expiresAt)) {
    try {
      access = await refreshAccessToken();
    } catch {
      handleUnauthorized();
      return new Response(null, { status: 401 });
    }
  }

  if (auth && access) {
    headers.Authorization = `Bearer ${access}`;
  }

  let response = await fetch(url, { ...options, headers });

  if (auth && retry && response.status === 401 && access) {
    try {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await fetch(url, {
          ...options,
          headers: { ...headers, Authorization: `Bearer ${newToken}` },
        });
      }
    } catch {
      handleUnauthorized();
      return response;
    }
  }

  return response;
}

export async function fetchIdentity() {
  return fetchCurrentUser();
}

export async function acceptInvitation({
  token,
  password,
  full_name,
  username,
}) {
  const query = new URLSearchParams({ token });
  return requestJson(
    `/invitations/accept?${query.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, full_name, username }),
    },
    { auth: false },
  );
}

// Внутренний системный метод: /permissions не должен иметь пользовательского экрана.
// Он предназначен только для служебной загрузки справочника прав и условного
// рендера функциональности админских интерфейсов, если такой UI появится.
export async function fetchPermissions(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined && value !== null && value !== "") {
      query.append(key, value);
    }
  });

  return requestJson(
    `/permissions${query.toString() ? `?${query.toString()}` : ""}`,
  );
}

export async function fetchCurrentUser() {
  return requestJson("/users/me");
}

export async function updateCurrentUser(changes) {
  return requestJson("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export async function uploadCurrentUserAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch("/users/me/avatar", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw await createApiError(response, "Не удалось загрузить аватар.");
  }

  return response.json();
}

export async function fetchUsers(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      query.append(key, value);
  });
  return requestJson(`/users${query.toString() ? `?${query.toString()}` : ""}`);
}

export async function fetchUserById(userId) {
  return requestJson(`/users/${encodeURIComponent(userId)}`);
}

export async function fetchRoleById() {
  throw new ApiError(
    "Роут /roles/{role_id} пока не подключён на backend и возвращает 404.",
    {
      status: 404,
    },
  );
}

export async function updateRoleById() {
  throw new ApiError(
    "Роут /roles/{role_id} пока не подключён на backend и возвращает 404.",
    {
      status: 404,
    },
  );
}

const DOCUMENT_MAX_SIZE_BYTES = 30 * 1024 * 1024;
const DOCUMENT_ALLOWED_EXTENSION = /\.(pdf|docx|pptx|xlsx|md|html|txt|json)$/i;

function validateDocumentFile(file) {
  if (!file) {
    throw new ApiError("Выберите файл для загрузки.", { status: 400 });
  }
  if (!DOCUMENT_ALLOWED_EXTENSION.test(file.name || "")) {
    throw new ApiError(
      "Поддерживаются файлы .pdf, .docx, .pptx, .xlsx, .md, .html, .txt и .json.",
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

// ─────────────────────────────────────────────────────────────
// Courses API: documented read/update endpoints and frontend mappers
// ─────────────────────────────────────────────────────────────

const DIFFICULTY_TO_LEVEL = {
  beginner: "Новичок",
  intermediate: "Средний",
  advanced: "Продвинутый",
  expert: "Эксперт",
};

const LEVEL_TO_DIFFICULTY = {
  Новичок: "beginner",
  Средний: "intermediate",
  Продвинутый: "advanced",
  Эксперт: "expert",
};

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

export function courseLevelToDifficulty(level) {
  return LEVEL_TO_DIFFICULTY[level] || "beginner";
}

export function difficultyToCourseLevel(difficulty) {
  return DIFFICULTY_TO_LEVEL[difficulty] || "Новичок";
}

function parseMinutes(value) {
  const match = /(\d+)/.exec(String(value || ""));
  return match ? Number(match[1]) : null;
}

function contentBlockToMarkdown(block) {
  if (!block || typeof block !== "object") return "";

  if (block.content_type === "text") return block.md_content || "";
  if (block.content_type === "video") {
    return [block.url ? `[Видео](${block.url})` : "", block.description]
      .filter(Boolean)
      .join("\n\n");
  }
  if (block.content_type === "image")
    return block.image_url ? `![](${block.image_url})` : "";
  if (block.content_type === "program_code") {
    return [
      `\`\`\`${block.language || "text"}\n${block.code || ""}\n\`\`\``,
      block.explanation,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (block.content_type === "mermaid") {
    return [
      block.title ? `### ${block.title}` : "",
      `\`\`\`mermaid\n${block.md_content || ""}\n\`\`\``,
      block.explanation,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (block.content_type === "quiz") {
    return (block.questions || [])
      .map((question, index) => {
        const title = question?.question || `Вопрос ${index + 1}`;
        return [`${index + 1}. **${title}**`, question?.answer]
          .filter(Boolean)
          .join("\n\n");
      })
      .join("\n\n");
  }
  return [block.formula, block.explanation].filter(Boolean).join("\n\n");
}

function lessonMarkdownFromBlocks(contentBlocks) {
  return (contentBlocks || [])
    .map(contentBlockToMarkdown)
    .filter(Boolean)
    .join("\n\n---\n\n");
}

const SUPPORTED_CONTENT_TYPES = new Set([
  "text",
  "video",
  "program_code",
  "mermaid",
  "quiz",
  "math_formula",
  "chemical_formula",
  "musical_notation",
]);

function withoutEmptyValues(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
}

function sanitizeContentBlock(block) {
  const contentType = block?.content_type || "text";
  if (!SUPPORTED_CONTENT_TYPES.has(contentType)) {
    return null;
  }

  const payload = withoutEmptyValues({
    ...block,
    id: undefined,
    type: undefined,
    content_type: contentType,
    ai_generated:
      typeof block?.ai_generated === "boolean" ? block.ai_generated : false,
  });

  if (contentType === "text") {
    payload.md_content = block.md_content ?? block.content ?? "";
  } else if (contentType === "video") {
    payload.url = block.url ?? "";
    payload.description = block.description ?? "";
  } else if (contentType === "program_code") {
    payload.language = block.language ?? "text";
    payload.code = block.code ?? "";
    payload.explanation = block.explanation ?? "";
  } else if (contentType === "mermaid") {
    payload.title = block.title ?? "";
    payload.md_content = block.md_content ?? "";
    payload.explanation = block.explanation ?? "";
  } else if (contentType === "quiz") {
    payload.questions = Array.isArray(block.questions)
      ? block.questions.map((question) => ({
          question: question?.question || "",
          answer: question?.answer || "",
        }))
      : [];
  } else {
    payload.formula = block.formula ?? "";
    payload.explanation = block.explanation ?? "";
  }

  return payload;
}

function blocksToPayload(blocks) {
  return (blocks || []).map((block) => ({
    title: block.title || "",
    description: block.description || "",
    duration: block.duration || "",
    learning_objectives: block.learningObjectives || [],
    lessons: (block.lessons || []).map((lesson) => ({
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

export function buildCoursePayload(course) {
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

function readCourseModules(data) {
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

function normalizeModuleRef(module) {
  if (typeof module === "string") {
    return { id: module };
  }

  if (module?.module) {
    return normalizeModuleRef(module.module);
  }

  const id = module?.id || module?.module_id || module?.moduleId;
  return {
    ...module,
    id,
  };
}

function readModuleLessons(data) {
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

function normalizeLessonRef(lesson) {
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

function normalizeContentType(block) {
  const rawType = String(
    block?.content_type ||
      block?.contentType ||
      block?.block_type ||
      block?.type ||
      "text",
  ).toLowerCase();
  const aliases = {
    markdown: "text",
    md: "text",
    theory: "text",
    lecture: "text",
    code: "program_code",
    program: "program_code",
    diagram: "mermaid",
    question: "quiz",
    questions: "quiz",
    test: "quiz",
  };

  return aliases[rawType] || rawType;
}

function normalizeContentBlock(block) {
  const source =
    block && typeof block === "object" ? block : { content: block };
  const contentType = normalizeContentType(source);
  const normalized = {
    ...source,
    content_type: contentType,
    ai_generated:
      typeof source.ai_generated === "boolean" ? source.ai_generated : false,
  };

  if (contentType === "text") {
    normalized.md_content = String(
      source.md_content ??
        source.mdContent ??
        source.markdown ??
        source.text ??
        source.content ??
        source.theory ??
        "",
    );
  } else if (contentType === "image") {
    normalized.image_url = String(
      source.image_url ?? source.imageUrl ?? source.url ?? source.src ?? "",
    );
  } else if (contentType === "program_code") {
    normalized.language = String(source.language ?? source.lang ?? "text");
    normalized.code = String(source.code ?? source.content ?? "");
    normalized.explanation = String(
      source.explanation ?? source.description ?? "",
    );
  } else if (contentType === "mermaid") {
    normalized.md_content = String(
      source.md_content ??
        source.mdContent ??
        source.code ??
        source.content ??
        "",
    );
    normalized.explanation = String(
      source.explanation ?? source.description ?? "",
    );
  } else if (contentType === "quiz") {
    normalized.questions = Array.isArray(source.questions)
      ? source.questions
      : Array.isArray(source.items)
        ? source.items
        : [];
  }

  return normalized;
}

function normalizeTheoryContentBlocks(data) {
  const rawBlocks = Array.isArray(data)
    ? data
    : data?.content_blocks ||
      data?.contentBlocks ||
      data?.theory_blocks ||
      data?.theoryBlocks ||
      data?.blocks ||
      null;

  if (Array.isArray(rawBlocks)) {
    return rawBlocks.map(normalizeContentBlock).filter(Boolean);
  }

  const markdown =
    data?.theory ||
    data?.markdown ||
    data?.md_content ||
    data?.mdContent ||
    data?.content ||
    data?.text ||
    (typeof data === "string" ? data : "");

  return markdown
    ? [
        normalizeContentBlock({
          content_type: "text",
          ai_generated: false,
          md_content: markdown,
        }),
      ]
    : [];
}

export function mapCourseFromApi(data) {
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
    category: data.category || data.difficulty || "",
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

function courseChangesToPatch(changes) {
  const patch = {};
  if ("title" in changes) patch.title = changes.title;
  if ("description" in changes) patch.description = changes.description;
  if ("category" in changes) patch.category = changes.category;
  if ("duration" in changes) patch.duration = changes.duration;
  if ("format" in changes) patch.format = changes.format;
  if ("tags" in changes) patch.tags = changes.tags;
  if ("level" in changes)
    patch.difficulty = courseLevelToDifficulty(changes.level);
  if ("learningObjectives" in changes) {
    patch.learning_objectives = changes.learningObjectives;
  }
  return patch;
}

function moduleChangesToPatch(changes) {
  const patch = {};
  if ("title" in changes) patch.title = changes.title;
  if ("description" in changes) patch.description = changes.description;
  if ("duration" in changes) patch.duration = changes.duration;
  if ("learningObjectives" in changes) {
    patch.learning_objectives = changes.learningObjectives;
  }
  return patch;
}

function lessonChangesToPatch(changes) {
  const patch = {};
  if ("title" in changes) patch.title = changes.title;
  if ("summary" in changes) patch.description = changes.summary;
  if ("duration" in changes)
    patch.estimated_time_minutes = parseMinutes(changes.duration);
  if ("contentBlocks" in changes) {
    patch.content_blocks = (changes.contentBlocks || []).map(
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

async function jsonRequest(path, method, body, options = {}) {
  const { auth, retry, ...fetchOptions } = options;
  return requestJson(
    path,
    {
      ...fetchOptions,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(fetchOptions.headers || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    {
      auth: auth ?? true,
      retry: retry ?? true,
    },
  );
}

function courseBasicToLearningCourse(data) {
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
    category: data.category || data.difficulty || "Не указан",
    duration: data.duration || "По индивидуальному темпу",
    level: data.difficulty || "Не указан",
    difficulty: data.difficulty || data.level || "Не указан",
    format: data.format || "Теория + практика",
    learningObjectives:
      data.learning_objectives || data.learningObjectives || [],
    learning_objectives:
      data.learning_objectives || data.learningObjectives || [],
    blocks,
    modules: blocks,
  };
}

function moduleBasicToLearningBlock(data, currentBlock = {}) {
  const learningObjectives =
    data.learning_objectives || data.learningObjectives || [];
  return {
    ...currentBlock,
    id: data.id || data.module_id || data.moduleId,
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

function lessonBasicToLearningLesson(data, currentLesson = {}) {
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

function normalizePaginatedResponse(data, { page = 1, size = 20 } = {}) {
  const rawItems = Array.isArray(data)
    ? data
    : data?.items || data?.courses || data?.results || [];
  const items = rawItems.map((course) =>
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
  };
}

export async function fetchCoursesPage(
  { page = 1, size = 20 } = {},
  options = {},
) {
  const data = await jsonRequest("/course/", "POST", { page, size }, options);
  return normalizePaginatedResponse(data, { page, size });
}

export async function fetchCourses(params = {}, options = {}) {
  const response = await fetchCoursesPage(params, options);
  return response.items;
}

export async function getCourseBasicInfo(courseId, options = {}) {
  const data = await requestJson(
    `/course/basic/info/${encodeURIComponent(courseId)}`,
    options,
  );
  return courseBasicToLearningCourse(data);
}

export async function getCourse(courseId, options = {}) {
  return getCourseBasicInfo(courseId, options);
}

export async function getModuleBasicInfo(moduleId, options = {}) {
  const path = `/module/basic/info/${encodeURIComponent(moduleId)}`;
  const requestOptions = {
    ...options,
    auth: options.auth ?? false,
  };

  try {
    const data = await requestJson(path, requestOptions, {
      auth: requestOptions.auth,
      retry: requestOptions.retry ?? true,
    });
    return moduleBasicToLearningBlock(data);
  } catch (error) {
    if (error.status !== 405) {
      throw error;
    }

    const data = await jsonRequest(path, "POST", undefined, requestOptions);
    return moduleBasicToLearningBlock(data);
  }
}

export async function getLessonBasicInfo(lessonId, options = {}) {
  const path = `/lesson/basic/info/${encodeURIComponent(lessonId)}`;

  try {
    const data = await requestJson(path, options);
    return lessonBasicToLearningLesson(data);
  } catch (error) {
    if (error.status !== 405) {
      throw error;
    }

    const data = await jsonRequest(path, "POST", undefined, options);
    return lessonBasicToLearningLesson(data);
  }
}

export async function getLessonTheory(lessonId, options = {}) {
  const data = await requestJson(
    `/lesson/theory/${encodeURIComponent(lessonId)}`,
    options,
  );
  return normalizeTheoryContentBlocks(data);
}

export async function updateCourse(courseId, changes) {
  const patch = withoutEmptyValues(courseChangesToPatch(changes));
  if (!Object.keys(patch).length) return null;
  const query = new URLSearchParams({ course_id: courseId });
  const data = await jsonRequest(
    `/course/edit?${query.toString()}`,
    "PUT",
    patch,
  );
  return data?.modules
    ? mapCourseFromApi(data)
    : courseBasicToLearningCourse(data);
}

export async function updateModule(courseId, moduleId, changes) {
  const patch = withoutEmptyValues(moduleChangesToPatch(changes));
  if (!Object.keys(patch).length) return null;
  const data = await jsonRequest(
    `/module/edit/${encodeURIComponent(moduleId)}`,
    "PUT",
    patch,
  );
  return moduleBasicToLearningBlock(data);
}

export async function updateLesson(courseId, lessonId, changes) {
  if ("contentBlocks" in changes || "markdown" in changes) {
    return updateLessonContentBlocks(lessonId, changes.contentBlocks || []);
  }
  const patch = withoutEmptyValues(lessonChangesToPatch(changes));
  if (!Object.keys(patch).length) return null;
  const data = await jsonRequest(
    `/lesson/edit/${encodeURIComponent(lessonId)}`,
    "PUT",
    patch,
  );
  return lessonBasicToLearningLesson(data);
}

export async function updateLessonContentBlocks(lessonId, contentBlocks) {
  const payload = (Array.isArray(contentBlocks) ? contentBlocks : [])
    .map(sanitizeContentBlock)
    .filter(Boolean);
  const data = await jsonRequest(
    `/lesson/update/${encodeURIComponent(lessonId)}`,
    "PUT",
    payload,
  );
  return lessonBasicToLearningLesson({
    id: lessonId,
    content_blocks: payload,
    ...(data || {}),
  });
}

export async function createCourse() {
  throw new ApiError(
    "Создание курса не подключено: endpoint отсутствует в Courses API.",
    {
      status: 404,
    },
  );
}

export async function deleteModule() {
  throw new ApiError(
    "Удаление модуля не подключено: endpoint отсутствует в Courses API.",
    {
      status: 404,
    },
  );
}

export async function deleteLesson() {
  throw new ApiError(
    "Удаление урока не подключено: endpoint отсутствует в Courses API.",
    {
      status: 404,
    },
  );
}

function normalizeAgentResponse(data) {
  return {
    ...data,
    chatId: data?.chat_id || data?.chatId || null,
    content: data?.content ?? data?.response?.content ?? "",
  };
}

export async function askInterviewerAgent(payload) {
  return normalizeAgentResponse(
    await jsonRequest("/agent/interviewer", "POST", payload || {}),
  );
}

export async function askMentorAgent(payload) {
  return normalizeAgentResponse(
    await jsonRequest("/agent/mentor", "POST", payload || {}),
  );
}

export async function askEditorAgent(payload) {
  const data = await jsonRequest("/agent/editor", "POST", payload || {});
  const content = data?.response?.content;
  let parsedContent = null;
  if (typeof content === "string" && content.trim()) {
    try {
      parsedContent = JSON.parse(content);
    } catch {
      parsedContent = null;
    }
  }
  return { ...data, parsedContent };
}
