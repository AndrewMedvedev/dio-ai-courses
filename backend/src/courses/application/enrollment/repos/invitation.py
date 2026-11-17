from typing import Protocol

from uuid import UUID

from ddf.application.dtos import Page, Pagination
from ddf.application.repositories import Repository
from ddf.domain.vo import Email

from src.courses.domain.enrollment.entities import Invitation


class InvitationRepository(Repository[Invitation], Protocol):
    async def get_by_token(self, token: str) -> Invitation | None: ...

    async def find_by_course(
        self,
        course_id: UUID,
        pagination: Pagination,
    ) -> Page[Invitation]: ...

    async def get_active(
        self,
        email: Email,
        course_id: UUID,
    ) -> Invitation | None: ...
