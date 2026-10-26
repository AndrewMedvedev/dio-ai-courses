from dataclasses import dataclass
from uuid import UUID

from ddf.domain.events import Event
from ddf.domain.vo.email import Email

from src.iam.domain.types import RoleId


@dataclass(frozen=True, kw_only=True)
class OrganizationInvited(Event):
    """Приглашение в курс"""

    event_type: str = "organizations.invited"

    invitation_id: UUID
    invited_by: UUID
    email: Email
    granted_roles: set[RoleId]
    organization_id: UUID
    user_id: UUID | None = None
    url: str
