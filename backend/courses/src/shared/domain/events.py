from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol
from uuid import uuid4

from src.shared.utils.time import current_datetime


@dataclass(frozen=True, kw_only=True)
class Event:
    """Базовый класс доменного события."""

    event_id: str = field(default_factory=lambda: str(uuid4()))
    occurred_on: datetime = field(default_factory=current_datetime)
    version: int = 1

    def __post_init__(self) -> None:
        """Проверить корректность версии события после создания."""

        if self.version < 1:
            raise ValueError("Event version must be >= 1")


class EventPublisher(Protocol):
    """Порт публикации доменных событий за пределы доменного слоя."""

    async def publish(self, event: Event) -> None:
        """Опубликовать одно доменное событие."""
        ...

    async def publish_all(self, events: list[Event]) -> None:
        """Опубликовать список доменных событий."""
        ...
