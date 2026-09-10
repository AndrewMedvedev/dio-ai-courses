from typing import ClassVar

from dataclasses import dataclass
from uuid import UUID

from src.shared.domain.events import Event

from ..application.dtos import LessonProgressUpdateSchema


@dataclass(frozen=True, kw_only=True)
class LessonProgressUpdated(Event):
    event_type: ClassVar[str] = "courses.lesson.progress.updated"
    user_id: UUID
    lesson_id: UUID
    progress: LessonProgressUpdateSchema
