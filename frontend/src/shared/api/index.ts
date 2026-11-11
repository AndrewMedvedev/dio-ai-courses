export {
  ApiError,
  createApiError,
  type ApiErrorOptions,
  type ValidationErrors,
} from './api-error';
export {
  API_BASE,
  apiFetch,
  isAuthenticated,
  jsonRequest,
  redirectToLogin,
  requestJson,
  setUnauthorizedHandler,
  type JsonRequestOptions,
  type RequestOptions,
} from './backend';
export {
  isTokenExpired,
  normalizeTokenResponse,
  onTokenRefreshed,
  readStoredSession,
  saveStoredSession,
  setTokenChangeHandler,
  tokenStorage,
  type StoredSession,
  type TokenResponse,
} from './session';
export { buildQuery } from './build-query';
export type { ItemsPage, PageParams, Paginated, RawApiRecord } from './types';
export {
  AttachmentError,
  attachmentsApi,
  runWithConcurrency,
  validateAttachmentFile,
  type Attachment,
} from './attachments';

export { asRecord, asArray, asRecords } from './read-values';

export {
  DOCUMENT_ALLOWED_EXTENSION,
  DOCUMENT_ALLOWED_EXTENSIONS_LABEL,
  DOCUMENT_MAX_SIZE_BYTES,
  convertDocumentToMarkdown,
  saveDocument,
  uploadDocument,
} from './documents';
