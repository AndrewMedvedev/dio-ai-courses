from typing import Protocol

from uuid import UUID

from src.courses.application.learning.dtos import LessonTheorySessionFilters
from src.courses.domain.learning.entities import LessonTheorySession
from src.shared.application.repos import Repository


class LessonTheorySessionRepository(Repository[LessonTheorySession], Protocol):
    async def find(
        self,
        *,
        lesson_id: UUID,
        user_id: UUID,
        filters: LessonTheorySessionFilters | None = None,
    ) -> list[LessonTheorySession]: ...
