from typing import Protocol

from uuid import UUID

from ddf.domain.models import Entity

from .dtos import BaseQueryParamFilters, Page, Pagination


class Repository[EntityT: Entity](Protocol):
    async def create(self, entity: EntityT) -> EntityT: ...

    async def read(self, uid: UUID) -> EntityT | None: ...

    async def find(
        self,
        pagination: Pagination,
        filters: BaseQueryParamFilters | None = None,
    ) -> Page[EntityT]: ...

    async def update(self, uid: UUID, **kwargs) -> EntityT: ...

    async def upsert(self, entity: EntityT) -> None: ...

    async def delete(self, uid: UUID) -> None: ...

    async def exists(self, uid: UUID) -> bool: ...

    async def get_by_ids(self, ids: list[UUID]) -> tuple[EntityT, ...]: ...


class RepositoryDecorator[EntityT: Entity](Repository[EntityT]):
    def __init__(self, repo: Repository[EntityT]) -> None:
        self._repo = repo

    async def create(self, entity: EntityT) -> EntityT:
        return await self._repo.create(entity)

    async def read(self, uid: UUID) -> EntityT | None:
        return await self._repo.read(uid)

    async def find[FiltersT](
        self,
        pagination: Pagination,
        filters: BaseQueryParamFilters | None = None,
    ) -> Page[EntityT]:
        return await self._repo.find(pagination, filters=filters)

    async def update(self, uid: UUID, **kwargs) -> EntityT | None:
        return await self._repo.update(uid, **kwargs)

    async def upsert(self, entity: EntityT) -> None:
        await self._repo.upsert(entity)

    async def delete(self, uid: UUID) -> None:
        await self._repo.delete(uid)

    async def exists(self, uid: UUID) -> bool:
        return await self._repo.exists(uid)

    async def get_by_ids(self, ids: list[UUID]) -> tuple[EntityT, ...]:
        return await self._repo.get_by_ids(ids)
