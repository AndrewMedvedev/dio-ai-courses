from typing import ClassVar

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from src.shared.domain.events import Event


@dataclass(frozen=True, kw_only=True)
class LessonProgressUpdated(Event):
    event_type: ClassVar[str] = "courses.lesson.progress.updated"

    lesson_progress_id: UUID
    practice_completed_at: datetime | None = None
    test_completed_at: datetime | None = None
