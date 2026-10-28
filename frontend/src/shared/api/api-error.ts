export type ValidationErrors = Record<string, string>;

export interface ApiErrorOptions {
  status?: number;
  code?: string;
  validationErrors?: ValidationErrors;
  payload?: unknown;
}

export class ApiError extends Error {
  status?: number;
  code?: string;
  validationErrors: ValidationErrors;
  payload?: unknown;
  userMessage: string;

  constructor(
    message: string,
    { status, code, validationErrors, payload }: ApiErrorOptions = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.validationErrors = validationErrors || {};
    this.payload = payload;
    this.userMessage = message;
  }
}

interface ErrorDetail {
  loc?: unknown[];
  field?: string;
  msg?: string;
  message?: string;
}

interface ErrorBody {
  public_message?: unknown;
  message?: unknown;
  status?: number;
  code?: string;
  details?: unknown;
}

interface ErrorPayload {
  error?: ErrorBody | null;
  detail?: unknown;
  details?: unknown;
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function collectValidationErrors(payload: unknown): ValidationErrors {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as ErrorPayload;
  const rawDetails = source.error?.details || source.detail || source.details;
  const details: ErrorDetail[] = Array.isArray(rawDetails) ? rawDetails : [];

  return details.reduce<ValidationErrors>((acc, item) => {
    const loc = Array.isArray(item?.loc) ? item.loc : [];
    const field = String(item?.field || loc[loc.length - 1] || "form");
    acc[field] = item?.msg || item?.message || "Некорректное значение";
    return acc;
  }, {});
}

function detailsToMessage(details: unknown): string {
  if (!details) return "";
  if (typeof details === "string") return details.trim();
  if (Array.isArray(details)) {
    return details
      .map((item: string | ErrorDetail) => {
        if (typeof item === "string") return item;
        const loc = Array.isArray(item?.loc) ? item.loc.join(".") : item?.field;
        const text = item?.msg || item?.message;
        return [loc, text].filter(Boolean).join(": ");
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof details === "object") {
    return Object.entries(details)
      .map(([field, value]) => {
        if (Array.isArray(value)) return `${field}: ${value.join(", ")}`;
        if (value && typeof value === "object")
          return `${field}: ${JSON.stringify(value)}`;
        return `${field}: ${value}`;
      })
      .join("; ");
  }
  return "";
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "Некорректный запрос.",
  401: "Необходимо войти заново.",
  403: "Недостаточно прав для выполнения действия.",
  404: "Запрошенные данные не найдены.",
  413: "Файл слишком большой.",
  422: "Проверьте корректность заполнения полей.",
  429: "Слишком много запросов. Подождите и попробуйте снова.",
  500: "Сервис временно недоступен. Попробуйте позже.",
};

export async function createApiError(
  response: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  const payload = await parseResponsePayload(response).catch(() => null);
  const objectPayload =
    payload && typeof payload === "object" ? (payload as ErrorPayload) : null;
  const apiError = objectPayload ? objectPayload.error : null;
  const detail = typeof payload === "object" ? objectPayload?.detail : payload;
  const detailsMessage = detailsToMessage(
    apiError?.details || objectPayload?.details || objectPayload?.detail,
  );
  const message =
    (typeof apiError?.public_message === "string" &&
      apiError.public_message.trim()) ||
    (typeof apiError?.message === "string" && apiError.message.trim()) ||
    (typeof detail === "string" && detail.trim()) ||
    detailsMessage ||
    STATUS_MESSAGES[response.status] ||
    fallbackMessage;

  return new ApiError(message, {
    status: apiError?.status || response.status,
    code: apiError?.code,
    validationErrors:
      response.status === 422 ? collectValidationErrors(payload) : {},
    payload,
  });
}
