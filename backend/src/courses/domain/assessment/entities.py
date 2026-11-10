from typing import Any

from dataclasses import dataclass, field
from uuid import UUID

from src.courses.domain.assessment.enums import PracticeStatus
from src.shared.domain.entities import Entity


@dataclass(kw_only=True, slots=True)
class Practice(Entity):
    user_id: UUID
    module_id: UUID
    lesson_id: UUID
    status: PracticeStatus = PracticeStatus.NOT_STARTED

    practice: list[dict[str, Any]] = field(default_factory=list)

    def edit(
        self,
        *,
        status: PracticeStatus | None = None,
        practice: dict[str, Any] | None = None,
    ) -> None:
        if status is not None:
            self.status = status

        if practice is not None:
            self.practice = practice


@dataclass(kw_only=True, slots=True)
class MemberPractice(Entity):
    user_id: UUID
    course_id: UUID
    messages: list[dict] = field(default_factory=list)

    def replace_messages(self, messages: list[dict]) -> None:
        self.messages = messages.copy()
