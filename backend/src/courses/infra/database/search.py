from typing import cast

from collections.abc import Callable

from ddf.application.dsl import Condition, Expression, Group, Negation, Search
from ddf.infra.database.sqlalchemy.base import Base as DdfBase
from ddf.infra.database.sqlalchemy.filters import compile_filter
from ddf.utils.cases import camel_to_snake_case
from pydantic import TypeAdapter
from sqlalchemy import Select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import Base
from src.shared.application.dtos import Page, Pagination
from src.shared.infra.database.repos.sqlalchemy import paginate

from ...application.dtos import SearchParams


def _typed_query(model: type[Base], query: Expression, fields: tuple[str, ...]) -> Expression:
    if isinstance(query, Group):
        return query.model_copy(
            update={"filters": tuple(_typed_query(model, item, fields) for item in query.filters)}
        )
    if isinstance(query, Negation):
        return query.model_copy(update={"filter_": _typed_query(model, query.filter_, fields)})
    if isinstance(query, Condition) and query.field in fields and query.value is not None:
        column = getattr(model, camel_to_snake_case(query.field))
        adapter = TypeAdapter(column.type.python_type)
        value = query.value
        if query.op in ("$in", "$nin"):
            if not isinstance(value, (list, tuple, set)):
                raise ValueError("Для $in/$nin нужен список значений")
            value = [adapter.validate_python(item) for item in value]
        elif query.op not in ("$isNull", "$isNotNull"):
            value = adapter.validate_python(value)
        return query.model_copy(update={"value": value})
    return query


def apply_search[ModelT: Base](
    model: type[ModelT],
    stmt: Select[tuple[ModelT]],
    query: Expression | str | None,
    fields: tuple[str, ...],
    text_fields: tuple[str, ...] = (),
    search: str | None = None,
) -> Select[tuple[ModelT]]:
    if isinstance(query, str):
        query = TypeAdapter[Expression](Expression).validate_json(query)
    if search and search.strip():
        keywords = Search(query=search.strip())
        query = Group(op="$and", filters=(query, keywords)) if query is not None else keywords
    if query is None:
        return stmt

    def full_text(text: str):
        document = func.concat_ws(" ", *(getattr(model, field) for field in text_fields))
        return func.to_tsvector("russian", document).op("@@")(
            func.plainto_tsquery("russian", text)
        )

    return stmt.where(
        compile_filter(
            # DDF использует колонки SQLAlchemy, а не наследование от своего Base.
            cast(type[DdfBase], model),
            _typed_query(model, query, fields),
            fields,
            full_text if text_fields else None,
        )
    )


async def search_page[ModelT: Base, ItemT](
    *,
    session: AsyncSession,
    model: type[ModelT],
    stmt: Select[tuple[ModelT]],
    pagination: Pagination,
    mapper: Callable[[ModelT], ItemT],
    fields: tuple[str, ...],
    text_fields: tuple[str, ...] = (),
) -> Page[ItemT]:
    sort = "created_at:desc"
    if isinstance(pagination, SearchParams):
        stmt = apply_search(model, stmt, pagination.query, fields, text_fields, pagination.search)
        if pagination.sort is not None:
            field = camel_to_snake_case(pagination.sort.field)
            if field not in {camel_to_snake_case(name) for name in fields}:
                raise ValueError("Сортировка по этому полю недоступна")
            sort = f"{field}:{pagination.sort.direction}"
    return await paginate(
        session=session,
        model=model,
        stmt=stmt.order_by(None),
        pagination=pagination,
        mapper=mapper,
        sort=sort,
    )
