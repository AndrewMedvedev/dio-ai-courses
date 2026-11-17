import { asRecord, asRecords } from './read-values';
import { toText } from '@/shared/lib/text';
export type ValidationErrors = Record<string, string>;

export interface ApiErrorOptions {
  status?: number;
  code?: string;
  validationErrors?: ValidationErrors;
  payload?: unknown;
  isInternalError?: boolean;
}

export class ApiError extends Error {
  status?: number;
  code?: string;
  validationErrors: ValidationErrors;
  payload?: unknown;
  userMessage: string;
  isInternalError: boolean;

  constructor(
    message: string,
    {
      status,
      code,
      validationErrors,
      payload,
      isInternalError = false,
    }: ApiErrorOptions = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.validationErrors = validationErrors || {};
    this.payload = payload;
    this.userMessage = message;
    this.isInternalError = isInternalError;
  }
}

interface ErrorDetail {
  loc?: unknown[];
  field?: string;
  msg?: string;
  message?: string;
}

// Backend response validation can arrive as HTTP 400, not only 5xx.
// Keep the original payload for diagnostics, but never put these details in UI text.
const INTERNAL_ERROR =
  /\b(?:validation errors? for|ValidationError|ResponseValidationError|Traceback \(most recent call last\)|input_value\s*=|input_type\s*=|sqlalchemy\.|asyncpg\.|psycopg\w*\.|SQLSTATE|TypeError:|ReferenceError:)|\[type=|errors\.pydantic\.dev|<(?:!doctype|html|head|body|script|pre)\b/i;
const INTERNAL_ERROR_MESSAGE =
  'Сервис не смог обработать запрос. Попробуйте позже.';
const HTTP_STATUS_DETAIL =
  /^(?:Bad Request|Unauthorized|Not authenticated|Forbidden|Not Found|Method Not Allowed|Request Entity Too Large|Too Many Requests)$/i;

function publicText(value: unknown): string {
  return typeof value === 'string' && !INTERNAL_ERROR.test(value)
    ? value.trim()
    : '';
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
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function collectValidationErrors(payload: unknown): ValidationErrors {
  if (!payload || typeof payload !== 'object') return {};
  const source = payload as ErrorPayload;
  const rawDetails = source.error?.details || source.detail || source.details;
  const details = asRecords(rawDetails);

  return details.reduce<ValidationErrors>((acc, item) => {
    const loc = Array.isArray(item?.loc) ? item.loc : [];
    const field = toText(item?.field || loc[loc.length - 1] || 'form');
    const type = toText(item.type);
    const message = toText(item.msg || item.message);
    const context = asRecord(item.ctx);
    if (type === 'missing') acc[field] = 'Обязательное поле.';
    else if (/email/i.test(field) && /email|e-mail/i.test(message))
      acc[field] = 'Введите корректный email.';
    else if (type === 'string_too_short' && Number(context.min_length) > 0)
      acc[field] =
        `Минимальная длина — ${Number(context.min_length)} символов.`;
    else if (type === 'string_too_long' && Number(context.max_length) > 0)
      acc[field] =
        `Максимальная длина — ${Number(context.max_length)} символов.`;
    else if (
      [
        'string_type',
        'int_parsing',
        'int_type',
        'enum',
        'literal_error',
      ].includes(type)
    )
      acc[field] = 'Некорректное значение.';
    else acc[field] = publicText(message) || 'Некорректное значение.';
    return acc;
  }, {});
}

function detailsToMessage(details: unknown): string {
  if (!details) return '';
  if (typeof details === 'string') return details.trim();
  if (Array.isArray(details)) {
    return details
      .map((item: string | ErrorDetail) => {
        if (typeof item === 'string') return item;
        const loc = Array.isArray(item?.loc) ? item.loc.join('.') : item?.field;
        const text = item?.msg || item?.message;
        return [loc, text].filter(Boolean).join(': ');
      })
      .filter(Boolean)
      .join('; ');
  }
  if (typeof details === 'object') {
    return Object.entries(details)
      .map(([field, value]) => {
        if (Array.isArray(value))
          return `${field}: ${value.filter((item): item is string => typeof item === 'string').join(', ')}`;
        return typeof value === 'string' ? `${field}: ${value}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Некорректный запрос.',
  401: 'Необходимо войти заново.',
  403: 'Недостаточно прав для выполнения действия.',
  404: 'Запрошенные данные не найдены.',
  405: 'Это действие сейчас недоступно.',
  408: 'Сервер не успел ответить. Попробуйте ещё раз.',
  409: 'Данные уже изменились или действие уже выполнено. Обновите страницу.',
  413: 'Файл слишком большой.',
  422: 'Проверьте корректность заполнения полей.',
  429: 'Слишком много запросов. Подождите и попробуйте снова.',
  500: 'Сервис временно недоступен. Попробуйте позже.',
};

export async function createApiError(
  response: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  const payload = await parseResponsePayload(response).catch(() => null);
  const objectPayload =
    payload && typeof payload === 'object' ? (payload as ErrorPayload) : null;
  const apiError = objectPayload ? objectPayload.error : null;
  const detail = typeof payload === 'object' ? objectPayload?.detail : payload;
  const rawDetails =
    apiError?.details || objectPayload?.details || objectPayload?.detail;
  const explicitPublicMessage = publicText(apiError?.public_message);
  const rawMessage = [apiError?.message, detail].find(
    (value): value is string =>
      typeof value === 'string' && Boolean(value.trim()),
  );
  const detailsMessage = detailsToMessage(rawDetails);
  const isInternalError =
    !explicitPublicMessage &&
    (response.status >= 500 ||
      INTERNAL_ERROR.test(rawMessage || detailsMessage) ||
      asRecords(rawDetails).some(
        (item) => Array.isArray(item.loc) && item.loc[0] === 'response',
      ));
  const validationErrors =
    response.status === 422 && !isInternalError
      ? collectValidationErrors(payload)
      : {};
  const message =
    explicitPublicMessage ||
    (isInternalError
      ? INTERNAL_ERROR_MESSAGE
      : (HTTP_STATUS_DETAIL.test(rawMessage?.trim() || '')
          ? STATUS_MESSAGES[response.status]
          : publicText(rawMessage)) ||
        Object.values(validationErrors).join(' ') ||
        publicText(detailsMessage) ||
        STATUS_MESSAGES[response.status] ||
        (!/^Ошибка запроса(?:\s|$)/.test(fallbackMessage) &&
          publicText(fallbackMessage)) ||
        'Не удалось выполнить запрос. Попробуйте ещё раз.');

  return new ApiError(message, {
    status: apiError?.status || response.status,
    code: apiError?.code,
    validationErrors,
    isInternalError,
    payload,
  });
}
