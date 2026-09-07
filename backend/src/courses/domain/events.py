from typing import ClassVar

from dataclasses import dataclass
from uuid import UUID

from src.shared.domain.events import Event


@dataclass(frozen=True, kw_only=True)
class PracticePassed(Event):
    event_type: ClassVar[str] = "courses.practice.passed"

    user_id: UUID
    course_id: UUID
    module_id: UUID
    lesson_id: UUID


@dataclass(frozen=True, kw_only=True)
class TestPassed(Event):
    event_type: ClassVar[str] = "courses.test.passed"

    user_id: UUID
    course_id: UUID
    module_id: UUID
    lesson_id: UUID
