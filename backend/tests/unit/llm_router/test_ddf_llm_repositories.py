from typing import cast

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, call
from uuid import uuid4

import pytest
from ddf.application.dtos import CursorPagination, OffsetPagination, create_page
from ddf.domain.vo.email import Email
from fastapi import FastAPI, status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.activity.domain.models import ActivityLog
from src.activity.infra.repos import ActivityLogMapper, SqlActivityLogRepository
from src.features import add_ai_models
from src.iam.api.v1.users import router as users_router
from src.iam.application.dtos import Identity, IdentityType
from src.iam.dependencies.identity import get_current_identity
from src.iam.dependencies.repos import get_user_repository
from src.iam.domain.entities import User
from src.iam.domain.vo import SecretHash
from src.llm_router import utils
from src.llm_router.api.v1.ai_models import router as ai_models_router
from src.llm_router.dependencies import get_ai_model_repo
from src.llm_router.domain.dataclass import AIModel
from src.llm_router.domain.enums import Complexity
from src.llm_router.infra.repository import AIModelMapper, SqlAIModelRepository
from src.notifications.domain.entities import Notification
from src.notifications.domain.vo import NotificationType
from src.notifications.infra.database.mappers import NotificationMapper
from src.notifications.infra.database.repos.notification import SqlNotificationRepository


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "rows", [[], [{
        "name": "test-model", "description": "test", "complexity": Complexity.EASY,
        "context": 100,
    }]],
)
async def test_ai_model_fields_use_ddf_page_without_changing_items(rows: list[dict]) -> None:
    session = MagicMock(spec=AsyncSession)
    count_result = MagicMock()
    count_result.scalar_one.return_value = len(rows)
    rows_result = MagicMock()
    rows_result.mappings.return_value.all.return_value = rows
    session.execute = AsyncMock(side_effect=[count_result, rows_result])

    page = await SqlAIModelRepository(cast(AsyncSession, session)).read_fields(
        OffsetPagination(size=10),
    )

    assert page.items == rows
    assert page.meta.type == "offset"
    assert page.meta.total == len(rows)
    assert session.execute.await_count == (2 if rows else 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("cursor", [False, True])
async def test_notification_pagination_preserves_filters_and_date_order(cursor: bool) -> None:
    user_id = uuid4()
    notification = Notification(
        email=Email("student@example.com"), user_id=user_id,
        title="Test", message="Test", type=NotificationType.COURSE_INVITED,
    )
    model = NotificationMapper.to_model(notification)
    session = MagicMock(spec=AsyncSession)
    session.scalar = AsyncMock(return_value=1)
    result = MagicMock()
    result.all.return_value = [model]
    session.scalars = AsyncMock(return_value=result)
    pagination = CursorPagination(size=10) if cursor else OffsetPagination(size=10)

    page = await SqlNotificationRepository(cast(AsyncSession, session)).get_by_user(
        user_id, pagination, unread_only=True,
    )

    assert page.items == [notification]
    assert page.meta.type == pagination.type
    stmt = session.scalars.await_args.args[0]
    sql = str(stmt)
    assert "notifications.user_id =" in sql
    assert "notifications.read IS false" in sql
    assert "ORDER BY notifications.created_at DESC, notifications.id DESC" in sql
    assert session.scalar.await_count == (0 if cursor else 1)


@pytest.mark.asyncio
async def test_activity_page_preserves_aggregate_filter_and_occurred_order() -> None:
    activity = ActivityLog(
        aggregate_type="Course", aggregate_id=uuid4(), actor_id=uuid4(),
        action="updated", occurred_on=datetime(2026, 10, 26, tzinfo=UTC),
    )
    session = MagicMock(spec=AsyncSession)
    session.scalar = AsyncMock(return_value=1)
    result = MagicMock()
    result.all.return_value = [ActivityLogMapper.to_orm(activity)]
    session.scalars = AsyncMock(return_value=result)

    page = await SqlActivityLogRepository(cast(AsyncSession, session)).get_for_aggregate(
        "Course", activity.aggregate_id, pagination=OffsetPagination(),
    )

    assert page.items == [activity]
    assert page.meta.type == "offset"
    assert page.meta.total == 1
    sql = str(session.scalars.await_args.args[0])
    assert "activity_logs.aggregate_type =" in sql
    assert "activity_logs.aggregate_id =" in sql
    assert "ORDER BY activity_logs.occurred_on DESC, activity_logs.id DESC" in sql


@pytest.mark.asyncio
async def test_model_seed_updates_entity_using_ddf_repository_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entity = AIModel(
        name="test-model", description="old", complexity=Complexity.EASY, context=100,
    )
    session = MagicMock(spec=AsyncSession)
    result = MagicMock()
    result.scalar_one_or_none.return_value = AIModelMapper.to_model(entity)
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    repo = SqlAIModelRepository(cast(AsyncSession, session))
    repo.update = AsyncMock()
    repo.create = AsyncMock()
    monkeypatch.setattr(add_ai_models, "SqlAIModelRepository", lambda _: repo)

    data = {
        "name": "test-model", "description": "new", "complexity": Complexity.HARD,
        "context": 200,
    }
    await add_ai_models.add_models_to_db(session, [data])

    assert repo.update.await_args is not None
    updated = repo.update.await_args.args[0]
    assert isinstance(updated, AIModel)
    assert updated.id == entity.id
    assert updated.name == entity.name
    assert updated.description == data["description"]
    assert updated.complexity is data["complexity"]
    assert updated.context == data["context"]
    repo.create.assert_not_awaited()
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_ai_model_cache_uses_same_ddf_key_for_read_and_write(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    page = create_page(OffsetPagination(), [{"name": "test-model"}], 1)
    serialized = page.model_dump_json()
    redis = MagicMock()
    redis.get = AsyncMock(side_effect=[None, None, serialized])
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock()
    monkeypatch.setattr(utils, "redis_client", redis)
    source = AsyncMock(return_value=page)

    first = await utils.cache_ai_models(source)
    second = await utils.cache_ai_models(source)

    assert first == second == page
    source.assert_awaited_once()
    redis.set.assert_any_await("ai_models:ddf", serialized, ex=3600)
    assert redis.get.await_args_list == [
        call("ai_models:ddf"), call("lock:ai_models:ddf"), call("ai_models:ddf"),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("page_no", "expected_status"),
    [(2, status.HTTP_200_OK), (0, status.HTTP_422_UNPROCESSABLE_CONTENT)],
)
async def test_ai_model_http_accepts_offset_body_and_returns_ddf_page(
    page_no: int, expected_status: int,
) -> None:
    model = AIModel(
        name="test-model", description="Test", complexity=Complexity.MEDIUM, context=100,
    )
    repo = MagicMock()
    pagination = OffsetPagination(page=2, size=3)
    repo.find = AsyncMock(return_value=create_page(pagination, [model], 7))
    app = FastAPI()
    app.include_router(ai_models_router)
    app.dependency_overrides[get_ai_model_repo] = lambda: repo
    app.dependency_overrides[get_current_identity] = lambda: Identity(
        id=uuid4(), type=IdentityType.USER, organization_id=uuid4(),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/ai-models/search", json={"page": page_no, "size": 3})

    assert response.status_code == expected_status
    if expected_status != status.HTTP_200_OK:
        repo.find.assert_not_awaited()
        return
    repo.find.assert_awaited_once_with(pagination)
    payload = response.json()
    assert set(payload) == {"items", "meta"}
    assert payload["items"][0]["id"] == str(model.id)
    assert payload["items"][0]["complexity"] == model.complexity.value
    assert payload["meta"] == {
        "type": "offset", "page": 2, "size": 3, "total": 7, "pages": 3,
        "has_next": True, "has_prev": True,
    }


@pytest.mark.asyncio
async def test_user_search_http_passes_ddf_query_sort_and_query_pagination() -> None:
    user = User(email=Email("student@example.com"), password_hash=SecretHash("test-hash"))
    pagination = OffsetPagination(page=2, size=3)
    total = 4
    repo = MagicMock()
    repo.find = AsyncMock(return_value=create_page(pagination, [user], total))
    app = FastAPI()
    app.include_router(users_router)
    app.dependency_overrides[get_user_repository] = lambda: repo
    app.dependency_overrides[get_current_identity] = lambda: Identity(
        id=user.id, type=IdentityType.USER, organization_id=uuid4(),
    )
    body = {
        "query": {"field": "is_active", "op": "$eq", "value": True},
        "sort": {"field": "created_at", "direction": "desc"},
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/users/search?page=2&size=3", json=body)

    assert response.status_code == status.HTTP_200_OK
    assert repo.find.await_args is not None
    assert repo.find.await_args.args == (pagination,)
    assert repo.find.await_args.kwargs["query"].model_dump() == body["query"]
    assert repo.find.await_args.kwargs["sort"].model_dump() == body["sort"]
    payload = response.json()
    assert set(payload) == {"items", "meta"}
    assert payload["items"][0]["email"] == user.email.value
    assert "password_hash" not in payload["items"][0]
    assert payload["meta"]["page"] == pagination.page
    assert payload["meta"]["total"] == total
