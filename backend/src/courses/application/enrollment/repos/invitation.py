from typing import Protocol

from uuid import UUID

from src.courses.domain.enrollment.entities import Invitation
from src.shared.application.dtos import Page, Pagination
from src.shared.application.repos import Repository
from src.shared.domain.vo import Email


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
