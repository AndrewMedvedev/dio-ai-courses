from typing import Protocol

from collections.abc import Sequence

from ddf.domain.events import Event


class EventPublisher(Protocol):
    """
    Абстракция для публикации доменных событий.
    Доменный слой знает только об этом интерфейсе.
    """

    async def publish(self, event: Event) -> None:
        """Опубликовать доменное событие."""

    async def publish_all(self, events: Sequence[Event]) -> None:
        """Опубликовать сразу несколько событий (удобно после сохранения агрегата)."""
