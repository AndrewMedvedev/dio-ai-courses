from typing import Protocol

from src.courses.infra.services.client import SrvCourseClient
from src.organization.application.dtos import InvitationCreate as OrganizationInvitationCreate
from src.organization.domain.entities import Invitation as OrganizationInvitation


class OrganizationRepository(Protocol):
    async def __call__(
        self,
        client: SrvCourseClient,
        dto: OrganizationInvitationCreate,
    ) -> OrganizationInvitation | None: ...
