from typing import ClassVar
from dataclasses import dataclass
from uuid import UUID

from src.shared.domain.events import Event
from src.shared.domain.vo import Email

from ..application.dtos import LessonProgressUpdateSchema
from .vo import MemberRole


@dataclass(frozen=True, kw_only=True)
class LessonProgressUpdated(Event):
    event_type: ClassVar[str] = "courses.lesson.progress.updated"
    user_id: UUID
    lesson_id: UUID
    progress: LessonProgressUpdateSchema


@dataclass(frozen=True, kw_only=True)
class CourseInvited(Event):
    """Приглашение в курс"""

    event_type: str = "courses.invited"

    invitation_id: UUID
    course_id: UUID
    invited_by: UUID
    user_id: UUID | None = None
    email: Email
    role: MemberRole
    title: str
    url: str
