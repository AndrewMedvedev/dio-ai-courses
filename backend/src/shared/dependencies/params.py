from typing import Annotated

from datetime import datetime

from ddf.application.dsl import Expression
from ddf.application.dtos.sorting import parse_sort_query_param
from fastapi import Depends, Query
from pydantic import Json, PositiveInt

from src.shared.application.dtos import Pagination, SearchParams, TimeRangeFilters


def get_pagination(
    page: Annotated[
        PositiveInt,
        Query(
            ge=1,
            description="Номер страницы (начинается с 1)",
            examples=[1],
        ),
    ] = 1,
    size: Annotated[
        PositiveInt,
        Query(
            ge=1,
            le=100,
            description="Количество элементов на странице (от 1 до 100)",
            examples=[20],
        ),
    ] = 10,
) -> Pagination:
    return Pagination(page=page, size=size)


def get_time_range_filters(
    created_after: Annotated[datetime | None, Query(description="Создан после")] = None,
    created_before: Annotated[datetime | None, Query(description="Создан до")] = None,
) -> TimeRangeFilters:
    return TimeRangeFilters(created_after=created_after, created_before=created_before)


PaginationDep = Annotated[Pagination, Depends(get_pagination)]
TimeRangeFiltersDep = Annotated[TimeRangeFilters, Depends(get_time_range_filters)]


def get_search_params(
    pagination: PaginationDep,
    query: Annotated[
        Json[Expression] | None, Query(description="Фильтр DDF в формате JSON")
    ] = None,
    sort: Annotated[str | None, Query(description="Поле:asc/desc или -поле")] = None,
) -> SearchParams:
    return SearchParams(
        **pagination.model_dump(),
        query=query,
        sort=parse_sort_query_param(sort) if sort is not None else None,
    )


SearchParamsDep = Annotated[SearchParams, Depends(get_search_params)]
