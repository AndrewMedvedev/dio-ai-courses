from typing import Annotated

from collections.abc import Awaitable, Callable
from datetime import datetime
from uuid import UUID

from ddf.application.dtos import OffsetPagination, Page
from fastapi import Depends, Query

from src.shared.dependencies import DBSession

from .domain.dtos import ActivityLogFilters
from .domain.repos import ActivityLogRepository
from .infra.repos import SqlActivityLogRepository
from .mappers import map_activity_log_to_response
from .recorder import ActivityRecorder
from .schemas import ActivityLogResponse

ActivityLogPaginatorFunc = Callable[[str, UUID], Awaitable[Page[ActivityLogResponse]]]


def get_activity_repo(session: DBSession) -> SqlActivityLogRepository:
    return SqlActivityLogRepository(session)


ActivityRepoDep = Annotated[ActivityLogRepository, Depends(get_activity_repo)]


def get_activity_recorder(activity_log_repo: ActivityRepoDep) -> ActivityRecorder:
    return ActivityRecorder(activity_log_repo)


ActivityRecorderDep = Annotated[ActivityLogRepository, Depends(get_activity_recorder)]


def get_activity_filters(
        actor_id: UUID | None = Query(None, description="Субъект выполнивший действие"),
        actions: list[str] | None = Query(None, min_length=1, description="Список действий"),
        occurred_after: datetime | None = Query(None, description="Произошло после"),
        occurred_before: datetime | None = Query(None, description="Произошло до")
) -> ActivityLogFilters:
    return ActivityLogFilters(
        actor_id=actor_id,
        actions=actions,
        occurred_after=occurred_after,
        occurred_before=occurred_before,
    )


ActivityLogFiltersDep = Annotated[ActivityLogFilters, Depends(get_activity_filters)]


async def paginate_activities(
        activity_log_repo: ActivityRepoDep,
        aggregate_type: str,
        aggregate_id: UUID,
        pagination: Annotated[OffsetPagination, Query()],
        filters: ActivityLogFiltersDep,
) -> Page[ActivityLogResponse]:
    page = await activity_log_repo.get_for_aggregate(
        aggregate_type, aggregate_id, pagination=pagination, filters=filters,
    )
    return page.map(map_activity_log_to_response)


async def get_activity_paginator(  # noqa: RUF029
        activity_repo: ActivityRepoDep,
        pagination: Annotated[OffsetPagination, Query()],
        filters: ActivityLogFiltersDep,
) -> ActivityLogPaginatorFunc:
    async def paginator(aggregate_type: str, aggregate_id: UUID) -> Page[ActivityLogResponse]:
        page = await activity_repo.get_for_aggregate(
            aggregate_type,
            aggregate_id,
            pagination=pagination,
            filters=filters,
        )
        return page.map(map_activity_log_to_response)

    return paginator
