// Загрузка документов: материалы для генерации курса и импорт в урок.
import { ApiError, apiFetch, createApiError } from "@/shared/api";

export const DOCUMENT_MAX_SIZE_BYTES = 30 * 1024 * 1024;
export const DOCUMENT_ALLOWED_EXTENSION =
  /\.(pdf|docx|pptx|xlsx|md|html|txt|json)$/i;
export const DOCUMENT_ALLOWED_EXTENSIONS_LABEL =
  ".pdf, .docx, .pptx, .xlsx, .md, .html, .txt и .json";

function validateDocumentFile(
  file: File | null | undefined,
): asserts file is File {
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

async function sendDocument(
  path: string,
  file: File | null | undefined,
): Promise<unknown> {
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

export async function uploadDocument(
  file: File | null | undefined,
): Promise<unknown> {
  return sendDocument("/documents/to/markdown", file);
}

/** Документ → markdown (для вставки в урок). */
export async function convertDocumentToMarkdown(
  file: File | null | undefined,
): Promise<unknown> {
  return sendDocument("/documents/to/markdown", file);
}

/** Загружает документ как материал для генерации курса. */
export async function saveDocument(
  file: File | null | undefined,
): Promise<unknown> {
  return sendDocument("/documents/upload", file);
}
