from typing import Protocol

from uuid import UUID

from src.iam.application.dtos import InvitationCreate as IAMInvitationCreate
from src.iam.application.dtos import UserResponse
from src.iam.domain.entities import Invitation as IAMInvitation
from src.iam.domain.entities import Membership


class IAMRepository(Protocol):
    async def get_user_by_email(
        self,
        email: str,
    ) -> UserResponse | None: ...

    async def invite_user_in_system(
        self,
        dto: IAMInvitationCreate,
    ) -> IAMInvitation | None: ...

    async def get_user_membership(
        self,
        organization_id: UUID,
        user_id: UUID,
    ) -> Membership | None: ...
