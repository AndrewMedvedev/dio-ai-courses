# pyright: reportArgumentType=false
from typing import Any, overload

from collections.abc import Callable
from uuid import UUID

from ddf.application.dtos import Page as DdfPage
from ddf.application.dtos import Pagination as DdfPagination
from ddf.application.dtos import QueryDTO, Sort
from ddf.domain.models import Entity
from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository as DdfRepository
from sqlalchemy import (
    ColumnElement,
    Select,
    UnaryExpression,
    asc,
    desc,
    exists,
    func,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import Base
from src.shared.application.dtos import BaseQueryParamFilters, Page, Pagination


def _parse_sort_param(
    sort: str,
) -> tuple[str, Callable[[ColumnElement[Any]], UnaryExpression[Any]]]:
    """
    Парсит строку сортировки и возвращает кортеж (имя_поля, функция_сортировки).
    Поддерживает форматы "field:asc"/"field:desc" и "-field"/"field".
    """

    if ":" in sort:
        field_name, direction = sort.split(":", maxsplit=1)
        sort_func = asc if direction.lower() == "asc" else desc

        return field_name, sort_func

    if sort.startswith("-"):
        field_name, sort_func = sort[1:], desc
    else:
        field_name, sort_func = sort, asc

    return field_name, sort_func


def apply_sorting[ModelT: Base](
    stmt: Select[tuple[ModelT]],
    model: type[ModelT],
    sort: str | None = None,
) -> Select[tuple[ModelT]]:
    """Динамически накладывает order_by на основе параметров из фильтра."""

    default_stmt = stmt.order_by(model.created_at)

    if sort is None:
        return default_stmt

    try:
        field_name, sort_func = _parse_sort_param(sort)

        if (column := getattr(model, field_name, None)) is not None:
            return stmt.order_by(sort_func(column))

    except AttributeError, ValueError:
        raise ValueError(f"Invalid sort query param - '{sort}'") from None

    return default_stmt


async def paginate[ModelT: Base, ItemT](
    session: AsyncSession,
    model: type[ModelT],
    stmt: Select[tuple[ModelT]],
    pagination: Pagination,
    *,
    mapper: Callable[[ModelT], ItemT] | None = None,
    sort: str | None = "created_at:desc",
) -> Page[ItemT]:
    count_stmt = select(func.count()).select_from(stmt.subquery())

    if not (total := await session.scalar(count_stmt)):
        return Page.create([], total, pagination.page, pagination.size)

    stmt = stmt.offset(pagination.offset).limit(pagination.size)
    stmt = apply_sorting(stmt, model, sort=sort)

    results = await session.execute(stmt)
    models = results.scalars().all()

    items = [mapper(model) for model in models] if mapper else models

    return Page.create(
        items=items,
        total=total,
        page=pagination.page,
        size=pagination.size,
    )


class SqlAlchemyRepository[EntityT: Entity, ModelT: Base](DdfRepository[EntityT, ModelT]):
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

    async def find(
        self,
        pagination: Pagination | DdfPagination,
        *args: Any,
        **kwargs: Any,
    ) -> Page[EntityT] | DdfPage[EntityT]:
        if not isinstance(pagination, Pagination):
            return await super().find(pagination, *args, **kwargs)

        stmt = select(self.model)
        filters = args[0] if args else kwargs.get("filters")

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            mapper=self.data_mapper.from_model,
            sort=filters.sort if filters else None,
        )

    async def exists(self, uid: UUID) -> bool:
        stmt = select(exists().where(self.model.id == uid))
        return bool(await self._session.scalar(stmt))
