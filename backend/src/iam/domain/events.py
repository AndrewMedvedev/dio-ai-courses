from dataclasses import dataclass
from uuid import UUID

from ddf.domain.events import Event
from ddf.domain.vo.email import Email

from .types import RoleId


@dataclass(frozen=True, kw_only=True)
class UserInvited(Event):
    """
    Пользователю отправлено приглашение.
    """

    event_type: str = "users.invited"

    invitation_id: UUID
    email: Email
    granted_roles: set[RoleId] | None = None
    organization_id: UUID | None = None
    invited_by: UUID
    url: str
