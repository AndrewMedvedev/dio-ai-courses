from typing import ClassVar

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from ddf.domain.events import Event
from pydantic import BaseModel


class LessonProgressUpdate(BaseModel):
    practice_completed_at: datetime | None = None
    test_completed_at: datetime | None = None


@dataclass(frozen=True, kw_only=True)
class LessonProgressUpdated(Event):
    event_type: ClassVar[str] = "courses.lesson.progress.updated"
    user_id: UUID
    lesson_id: UUID
    progress: LessonProgressUpdate
