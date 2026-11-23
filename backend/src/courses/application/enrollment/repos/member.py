from typing import Protocol

from uuid import UUID

from ddf.application.dtos import CursorPagination, Page
from ddf.application.repositories import Repository

from src.courses.domain.enrollment.entities import Member
from src.courses.domain.enrollment.vo import MemberRole


class MemberRepository(Repository[Member], Protocol):
    async def read(self, user_id: UUID, course_id: UUID) -> Member | None: ...

    async def exists(self, user_id: UUID, course_id: UUID) -> bool: ...

    async def find_by_course(
        self,
        course_id: UUID,
        pagination: CursorPagination,
    ) -> Page[Member]: ...

    async def read_role(self, user_id: UUID, course_id: UUID) -> MemberRole | None: ...
