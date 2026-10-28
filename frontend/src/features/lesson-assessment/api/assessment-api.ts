// Проверочные тесты и практика урока: генерация агентом и проверка ответов.
import {
  apiFetch,
  createApiError,
  jsonRequest,
  requestJson,
  type JsonRequestOptions,
  type RawApiRecord,
} from "@/shared/api";

export interface CreatedPractice {
  practice: unknown;
  practiceId: string | null;
  raw: unknown;
}

function normalizeCreatedPracticeResponse(
  data: RawApiRecord | null | undefined,
): CreatedPractice {
  const practice = data?.practice || data?.assignment || data?.test || data;
  return {
    practice,
    practiceId: data?.practice_id || data?.practiceId || data?.id || null,
    raw: data,
  };
}

function appendPracticeAssignmentFormFields(
  formData: FormData,
  assignment: unknown = {},
): void {
  formData.append("practice", JSON.stringify(assignment));
}

export async function generateLessonTest(
  moduleId: string,
  lessonId: string,
  options: RequestInit = {},
): Promise<CreatedPractice> {
  return normalizeCreatedPracticeResponse(
    await requestJson(
      `/agent/tests/${encodeURIComponent(moduleId)}/${encodeURIComponent(lessonId)}`,
      { method: "POST", ...(options || {}) },
    ),
  );
}

export async function checkLessonTest(
  practiceId: string,
  payload: unknown,
  options: JsonRequestOptions = {},
): Promise<RawApiRecord> {
  return jsonRequest(
    `/agent/check/tests/${encodeURIComponent(practiceId)}`,
    "POST",
    payload,
    options,
  );
}

export async function generateLessonPractice(
  moduleId: string,
  lessonId: string,
  options: RequestInit = {},
): Promise<CreatedPractice> {
  return normalizeCreatedPracticeResponse(
    await requestJson(
      `/agent/practices/${encodeURIComponent(moduleId)}/${encodeURIComponent(lessonId)}`,
      { method: "POST", ...(options || {}) },
    ),
  );
}

export async function checkLessonPractice(
  practiceId: string,
  assignment: unknown,
  file: Blob,
  options: RequestInit = {},
): Promise<RawApiRecord> {
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
