export { ApiError, createApiError } from '../../src/shared/api/api-error';
export { asRecord, asRecords, asArray } from '../../src/shared/api/read-values';
export type { RawApiRecord } from '../../src/shared/api/types';
export type {
  JsonRequestOptions,
  RequestOptions,
} from '../../src/shared/api/backend';
import type { RawApiRecord } from '../../src/shared/api/types';
export interface TestBody extends Record<string, unknown> {
  position?: { beforeId?: string; afterId?: string };
  chat_id?: string;
  content_block?: string;
  moduleId?: string;
  contentBlocks?: unknown[];
}
export const calls: { path: string; method: string; body: TestBody }[] = [];
export let respond: (
  path: string,
  method: string,
  body: TestBody,
) => RawApiRecord | Promise<RawApiRecord> = () => ({});
export function setResponder(next: typeof respond) {
  calls.length = 0;
  respond = next;
}
export async function requestJson(
  path: string,
  options: RequestInit = {},
  _auth?: unknown,
): Promise<RawApiRecord> {
  const body =
    typeof options.body === 'string'
      ? (JSON.parse(options.body) as TestBody)
      : ((options.body || {}) as TestBody);
  const method = options.method || 'GET';
  calls.push({ path, method, body });
  return await respond(path, method, body);
}
export function jsonRequest(
  path: string,
  method: string,
  body: unknown,
  options = {},
) {
  return requestJson(path, { ...options, method, body: JSON.stringify(body) });
}
export async function apiFetch(path: string, options: RequestInit) {
  return new Response(JSON.stringify(await requestJson(path, options)));
}

export const API_BASE = '/api/v1';
export function readStoredSession() {
  return { accessToken: null };
}
