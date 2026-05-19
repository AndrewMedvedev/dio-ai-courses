from __future__ import annotations

import abc
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from .events import Event


@dataclass(kw_only=True, slots=True)
class Entity(abc.ABC):
    """Базовая доменная сущность с идентичностью, soft-delete и событиями."""

    id: UUID
    created_at: datetime
    deleted_at: datetime | None = None
    _events: list[Event] = field(default_factory=list, init=False, repr=False)

    def __eq__(self, other: object) -> bool:
        """Сравнить сущности по идентификатору."""

        if not isinstance(other, Entity):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        """Получить хеш сущности по идентификатору."""

        return hash(self.id)

    @property
    def is_deleted(self) -> bool:
        """Проверить, что сущность помечена как удалённая."""

        return self.deleted_at is not None

    def register_event(self, event: Event) -> None:
        """Зарегистрировать доменное событие внутри сущности."""

        self._events.append(event)

    def collect_events(self) -> Iterator[Event]:
        """Собрать и очистить накопленные доменные события."""

        while self._events:
            yield self._events.pop(0)


@dataclass(kw_only=True, slots=True)
class AggregateRoot(Entity):
    """Корень агрегата, защищающий инварианты доменной модели."""
