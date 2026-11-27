from typing import Protocol

from uuid import UUID

from ddf.application.dtos import CursorPagination, Page

from src.courses.domain.learning.entities import CourseProgress

from .progress import ProgressRepository


class CourseProgressRepository(ProgressRepository[CourseProgress], Protocol):
    async def count_completed_lessons(self, course_progress_id: UUID) -> int: ...

    async def find_by_course(
        self, course_id: UUID, pagination: CursorPagination
    ) -> Page[CourseProgress]: ...
