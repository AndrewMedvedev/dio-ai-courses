from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from src.shared.domain.entities import AggregateRoot, Entity


@dataclass(kw_only=True, slots=True)
class LessonTheorySession(AggregateRoot):
    lesson_id: UUID
    user_id: UUID
    completed_at: datetime | None = None
    active_time_seconds: int = 0
    max_scroll_depth_percent: int = 0

    def edit(
        self,
        *,
        completed_at: datetime | None = None,
        active_time_seconds: int | None,
        max_scroll_depth_percent: int | None,
    ) -> None:
        if completed_at is not None:
            self.completed_at = completed_at

        if active_time_seconds is not None:
            self.active_time_seconds = active_time_seconds

        if max_scroll_depth_percent is not None:
            self.max_scroll_depth_percent = max_scroll_depth_percent


@dataclass(kw_only=True, slots=True)
class CourseProgress(Entity):
    """Хранит факт и момент завершения курса конкретным пользователем."""

    user_id: UUID
    course_id: UUID
    progress_percent: float


@dataclass(kw_only=True, slots=True)
class LessonProgress(Entity):
    """Хранит время завершения частей урока конкретным пользователем."""

    module_progress_id: UUID
    lesson_id: UUID
    theory_completed_at: datetime | None = None
    practice_completed_at: datetime | None = None
    test_completed_at: datetime | None = None


@dataclass(kw_only=True, slots=True)
class ModuleProgress(Entity):
    """Хранит время завершения модуля конкретным пользователем."""

    course_progress_id: UUID
    module_id: UUID
