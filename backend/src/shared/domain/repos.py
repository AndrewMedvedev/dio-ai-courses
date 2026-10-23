from typing import Protocol

from uuid import UUID

from ddf.application.uow import UnitOfWork
from ddf.domain.models import Entity

from src.activity.recorder import ActivityRecorder

from ..application.dtos import Page, Pagination
from .events import EventPublisher


class Repository[EntityT: Entity](Protocol):
    async def create(self, entity: EntityT) -> EntityT: ...

    async def read(self, uid: UUID) -> EntityT | None: ...

    async def paginate[T](
        self, pagination: Pagination, filters: T | None = None
    ) -> Page[EntityT]: ...

    async def update(self, entity: EntityT) -> None: ...

    async def delete(self, uid: UUID) -> None: ...

    async def exists(self, uid: UUID) -> bool: ...

    async def get_by_ids(self, ids: list[UUID]) -> list[EntityT]: ...


async def finalize[EntityT: Entity](
    uow: UnitOfWork,
    *aggregates: EntityT,
    event_publisher: EventPublisher,
    activity_recorder: ActivityRecorder | None = None,
) -> None:
    events = []
    for aggregate in aggregates:
        events.extend(aggregate.collect_events())

    if activity_recorder is not None:
        await activity_recorder.record_all(events)

    await uow.commit()

    await event_publisher.publish_all(events)


class RepositoryDecorator[EntityT: Entity](Repository[EntityT]):
    def __init__(self, repo: Repository[EntityT]) -> None:
        self._repo = repo

    async def create(self, entity: EntityT) -> EntityT:
        return await self._repo.create(entity)

    async def read(self, uid: UUID) -> EntityT | None:
        return await self._repo.read(uid)

    async def paginate(self, pagination: Pagination) -> Page[EntityT]:
        return await self._repo.paginate(pagination)

    async def update(self, entity: EntityT) -> None:
        await self._repo.update(entity)

    async def delete(self, uid: UUID) -> None:
        await self._repo.delete(uid)

    async def exists(self, uid: UUID) -> bool:
        return await self._repo.exists(uid)

    async def get_by_ids(self, ids: list[UUID]) -> list[EntityT]:
        return await self._repo.get_by_ids(ids)
