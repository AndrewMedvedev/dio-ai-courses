import secrets
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, SecretStr

from ...shared.domain.entities import Entity
from ...shared.utils.time import current_datetime


@dataclass(kw_only=True)
class User(Entity):
    """
    Пользователь тикет системы
    """

    username: str
    email: EmailStr
    password_hash: SecretStr
    is_verify: bool = False


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
    expires_at: datetime
    used_at: datetime | None = None
    is_used: bool = False
    updated_at: datetime = field(default_factory=current_datetime)

    @property
    def is_valid(self) -> bool:
        """Актуально ли приглашение"""

        return not self.is_used and self.expires_at > current_datetime()

    def mark_as_used(self) -> None:
        """Пометить, как использованное"""

        self.used_at = current_datetime()
        self.is_used = True
