# pyright: reportArgumentType=false
from typing import Any, ClassVar

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from ddf.application.dsl import Condition, Expression, Group, Negation
from ddf.infra.database.sqlalchemy.filters import compile_filter
from ddf.utils.cases import camel_to_snake_case
from pydantic import AwareDatetime, TypeAdapter
from sqlalchemy import (
    ColumnElement,
    Select,
    UnaryExpression,
    asc,
    delete,
    desc,
    exists,
    func,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import Base
from src.shared.application.dtos import BaseQueryParamFilters, Page, Pagination, SearchParams
from src.shared.domain.entities import Entity
from src.shared.infra.database.mappers import ModelMapper


def _typed_query(model: type[Base], query: Expression, fields: tuple[str, ...]) -> Expression:
    if isinstance(query, Group):
        return query.model_copy(
            update={"filters": tuple(_typed_query(model, item, fields) for item in query.filters)}
        )
    if isinstance(query, Negation):
        return query.model_copy(update={"filter_": _typed_query(model, query.filter_, fields)})
    if not isinstance(query, Condition):
        return query

    field = camel_to_snake_case(query.field)
    if field not in fields or (column := model.__table__.c.get(field)) is None:
        raise ValueError(f"Unknown filter field: '{query.field}'.")
    if query.op in ("$isNull", "$isNotNull"):
        return query.model_copy(update={"field": field})
    if query.value is None:
        if query.op not in ("$eq", "$ne"):
            raise ValueError(f"Operator '{query.op}' does not accept null.")
        return query.model_copy(update={"field": field})

    value_type = column.type.python_type
    if query.op in ("$like", "$ilike") and value_type is not str:
        raise ValueError(f"Operator '{query.op}' requires a text field.")
    if value_type is datetime and getattr(column.type, "timezone", False):
        value_type = AwareDatetime
    adapter = TypeAdapter(list[value_type] if query.op in ("$in", "$nin") else value_type)
    value = adapter.validate_python(query.value)
    return query.model_copy(update={"field": field, "value": value})


def apply_query[ModelT: Base](
    model: type[ModelT],
    stmt: Select[tuple[ModelT]],
    query: Expression | None,
    fields: tuple[str, ...],
    text_fields: tuple[str, ...] = (),
) -> Select[tuple[ModelT]]:
    if query is None:
        return stmt

    def full_text(text: str) -> ColumnElement[bool]:
        document = func.concat_ws(" ", *(getattr(model, field) for field in text_fields))
        return func.to_tsvector("russian", document).op("@@")(
            func.plainto_tsquery("russian", text)
        )

    return stmt.where(
        compile_filter(
            model,
            _typed_query(model, query, fields),
            fields,
            full_text if text_fields else None,
        )
    )


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
    fields: tuple[str, ...] = (),
    text_fields: tuple[str, ...] = (),
) -> Page[ItemT]:
    if isinstance(pagination, SearchParams) and fields:
        stmt = apply_query(model, stmt, pagination.query, fields, text_fields)
        if pagination.sort is not None:
            field = camel_to_snake_case(pagination.sort.field)
            if field not in fields or model.__table__.c.get(field) is None:
                raise ValueError(f"Unknown sort field: '{pagination.sort.field}'.")
            sort = f"{field}:{pagination.sort.direction}"
            stmt = stmt.order_by(None)

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


class SqlAlchemyRepository[EntityT: Entity, ModelT: Base]:
    model: type[ModelT]
    model_mapper: ModelMapper[EntityT, ModelT]
    query_fields: ClassVar[tuple[str, ...]] = ()
    text_fields: ClassVar[tuple[str, ...]] = ()

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entity: EntityT) -> EntityT:

        model = self.model_mapper.to_model(entity)
        self._session.add(model)
        return self.model_mapper.from_model(model)

    async def read(self, uid: UUID) -> EntityT | None:
        stmt = select(self.model).where(self.model.id == uid)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def find(
        self,
        pagination: Pagination,
        filters: BaseQueryParamFilters | None = None,
    ) -> Page[EntityT]:
        """Для расширения логики фильтрации можно переопределить в дочерних классах."""

        stmt = select(self.model)

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            mapper=self.model_mapper.from_model,
            sort=filters.sort if filters else None,
            fields=self.query_fields,
            text_fields=self.text_fields,
        )

    async def update(self, uid: UUID, **kwargs) -> EntityT | None:
        stmt = (
            update(self.model).values(**kwargs).where(self.model.id == uid).returning(self.model)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def upsert(self, entity: EntityT) -> None:
        model = self.model_mapper.to_model(entity)
        await self._session.merge(model)

    async def delete(self, uid: UUID) -> None:
        stmt = delete(self.model).where(self.model.id == uid)
        await self._session.execute(stmt)

    async def exists(self, uid: UUID) -> bool | None:
        stmt = select(exists().where(self.model.id == uid))
        return await self._session.scalar(stmt)

    async def get_by_ids(self, ids: list[UUID]) -> list[EntityT]:
        stmt = select(self.model).where(self.model.id.in_(ids))
        results = await self._session.execute(stmt)
        return [self.model_mapper.from_model(model) for model in results.scalars().all()]
