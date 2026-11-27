from typing import Protocol, overload

from ddf.application.dtos import Page as DdfPage
from ddf.application.dtos import Pagination as DdfPagination
from ddf.application.dtos import QueryDTO, Sort
from ddf.application.repositories import Repository as DdfRepository
from ddf.domain.models import Entity

from .dtos import BaseQueryParamFilters, Page, Pagination


class Repository[EntityT: Entity](DdfRepository[EntityT], Protocol):
    @overload
    async def find(
        self,
        pagination: Pagination,
        filters: BaseQueryParamFilters | None = None,
    ) -> Page[EntityT]: ...

    @overload
    async def find(
        self,
        pagination: DdfPagination,
        query: QueryDTO | None = None,
        sort: Sort | None = None,
    ) -> DdfPage[EntityT]: ...
