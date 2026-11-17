from typing import Protocol

from uuid import UUID

from ddf.application.repositories import Repository

from src.courses.application.learning.dtos import LessonTheorySessionFilters
from src.courses.domain.learning.entities import LessonTheorySession


class LessonTheorySessionRepository(Repository[LessonTheorySession], Protocol):
    async def find(
        self,
        *,
        lesson_id: UUID,
        user_id: UUID,
        filters: LessonTheorySessionFilters | None = None,
    ) -> list[LessonTheorySession]: ...
