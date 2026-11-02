// Публичный API сущности course для сущности agent-chat (FSD cross-import «@x»):
// ИИ-редактору нужно приводить контент-блоки к формату бэкенда.
export {
  SUPPORTED_CONTENT_TYPES,
  normalizeContentType,
  sanitizeContentBlock,
} from "../lib/content-blocks";
