import secrets
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4

from pydantic import EmailStr, SecretStr

from .utils.time import current_datetime


@dataclass(frozen=True)
class Event:
    """
    Базовый класс для всех доменных событий
    """

    event_id: UUID = field(default_factory=uuid4)
    occurred_on: datetime = field(default_factory=current_datetime)
    version: int = field(default=1)

    def __post_init__(self):
        if self.version < 1:
            raise ValueError("Event version must be >= 1")


@dataclass
class Entity:
    """
    Базовая доменная сущность, от которой наследуются все остальные бизнес модели.
    Идентичность определяется уникальным ID, а не аттрибутами модели.
    """

    _events: list[Event] = field(default_factory=list, init=False)

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    created_at: datetime = field(default_factory=current_datetime)
    updated_at: datetime = field(default_factory=current_datetime)

    def __eq__(self, other) -> bool:
        if not isinstance(other, Entity):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)

    def register_event(self, event: Event) -> None:
        self._events.append(event)

    def collect_events(self) -> Iterator[Event]:
        while self._events:
            yield self._events.pop(0)


@dataclass(kw_only=True)
class User(Entity):
    """
    Пользователь тикет системы
    """

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
