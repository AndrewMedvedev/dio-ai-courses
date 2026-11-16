from typing import Protocol

from uuid import UUID

from src.courses.domain.learning.entities import CourseProgress
from src.shared.application.dtos import Page, Pagination

from .progress import ProgressRepository


class CourseProgressRepository(ProgressRepository[CourseProgress], Protocol):
    async def count_completed_lessons(self, course_progress_id: UUID) -> int: ...

    async def find_by_course(
        self, course_id: UUID, pagination: Pagination
    ) -> Page[CourseProgress]: ...
