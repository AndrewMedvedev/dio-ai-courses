from typing import Protocol, Self, runtime_checkable

from collections.abc import Awaitable, Callable
from uuid import UUID

from ..schemas import Page, PageParams
from .entities import Entity
from .exceptions import NotFoundError


@runtime_checkable
class UnitOfWork(Protocol):
    async def __aenter__(self) -> Self: ...

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...

    async def flush(self) -> None: ...


class Repository[EntityT: Entity](Protocol):
    async def create(self, entity: EntityT) -> EntityT: ...

    async def read(self, uid: UUID) -> EntityT | None: ...

    async def paginate(self, params: PageParams) -> Page[EntityT]: ...

    async def update(self, entity: EntityT) -> None: ...

    async def delete(self, uid: UUID) -> None: ...

    async def exists(self, uid: UUID) -> bool: ...

    async def get_by_ids(self, ids: list[UUID]) -> list[EntityT]: ...


async def get_or_raise_404[EntityT: Entity](
    loader: Callable[[UUID], Awaitable[EntityT | None]],
    uid: UUID,
    aggregate_type: type[EntityT],
) -> EntityT:
    obj = await loader(uid)
    if obj is None:
        raise NotFoundError(f"{aggregate_type.__class__.__name__} with ID {uid} not found")

    return obj
