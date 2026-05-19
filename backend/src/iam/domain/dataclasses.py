import secrets
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, SecretStr

from ...shared.domain.entities import Entity
from ...shared.utils.time import current_datetime
from .vo import Username, UserRole


@dataclass(kw_only=True)
class User(Entity):
    """
    Пользователь тикет системы
    """

    username: Username
    email: EmailStr
    password_hash: SecretStr
    role: UserRole
    is_verify: bool = False

    def mark_is_verify(self) -> None:
        self.is_verify = True

    def change_role(self, role: UserRole) -> None:
        self.role = role


def generate_invite_token(length: int = 32) -> str:
    """Генерация токена для активации приглашения"""

    return secrets.token_urlsafe(length)


@dataclass(kw_only=True)
class Invitation(Entity):
    """
    Приглашение в тикет систему для нового пользователя
    """

    email: EmailStr
    token: str = field(default_factory=generate_invite_token)
    invited_by: UUID | None = None
    assigned_role: UserRole
    expires_at: datetime
    used_at: datetime | None = None
    is_used: bool = False
    is_delivered: bool = True
    updated_at: datetime = field(default_factory=current_datetime)

    @property
    def is_valid(self) -> bool:
        """Актуально ли приглашение"""

        return not self.is_used and self.expires_at > current_datetime()

    def mark_as_used(self) -> None:
        """Пометить, как использованное"""

        self.used_at = current_datetime()
        self.is_used = True
