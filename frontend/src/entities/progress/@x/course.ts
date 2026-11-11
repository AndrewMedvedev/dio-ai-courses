// Публичный API сущности progress для сущности course (FSD cross-import «@x»):
// списки и дерево курса показывают статусы прохождения.
export {
  PROGRESS_STATUS,
  PROGRESS_STATUS_LABELS,
  getLessonProgressStatus,
  getModuleProgressSummary,
  type LessonProgress,
  type ModuleProgressSummary,
  type ProgressStatus,
} from "../model/progress-service";
