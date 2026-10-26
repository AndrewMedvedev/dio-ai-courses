from typing import Annotated

from datetime import datetime

from ddf.application.dtos import PaginationQuery as PaginationDep
from fastapi import Depends, Query

from src.shared.application.dtos import TimeRangeFilters


def get_time_range_filters(
        created_after: Annotated[datetime | None, Query(description="Создан после")] = None,
        created_before: Annotated[datetime | None, Query(description="Создан до")] = None,
) -> TimeRangeFilters:
    return TimeRangeFilters(created_after=created_after, created_before=created_before)


TimeRangeFiltersDep = Annotated[TimeRangeFilters, Depends(get_time_range_filters)]

__all__ = ["PaginationDep", "TimeRangeFiltersDep", "get_time_range_filters"]
