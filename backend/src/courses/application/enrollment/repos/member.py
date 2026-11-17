from typing import Protocol

from uuid import UUID

from src.courses.domain.enrollment.entities import Member
from src.courses.domain.enrollment.vo import MemberRole
from src.shared.application.dtos import Page, Pagination
from src.shared.application.repos import Repository


class MemberRepository(Repository[Member], Protocol):
    async def read(self, user_id: UUID, course_id: UUID) -> Member | None: ...

    async def exists(self, user_id: UUID, course_id: UUID) -> bool: ...

    async def find_by_course(
        self,
        course_id: UUID,
        pagination: Pagination,
    ) -> Page[Member]: ...

    async def read_role(self, user_id: UUID, course_id: UUID) -> MemberRole | None: ...
