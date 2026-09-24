from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.feedback.api.v1.feedback import router
from src.iam.application.dtos import Identity, IdentityType
from src.iam.dependencies.identity import get_current_identity
from src.iam.domain.vo import Email
from src.shared.dependencies.events import get_event_publisher
from src.shared.domain.exceptions import AppError


def _client(identity: Identity) -> tuple[TestClient, AsyncMock, AsyncMock]:
    """Поднимает только feedback API с подменёнными внешними зависимостями."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = 0
    publisher = AsyncMock()
    app.dependency_overrides[get_current_identity] = lambda: identity
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_event_publisher] = lambda: publisher

    @app.exception_handler(AppError)
    def handle_app_error(_request: Request, error: AppError) -> JSONResponse:
        return JSONResponse(status_code=error.status_code, content={"error": error.error_code})

    return TestClient(app), session, publisher


def test_http_post_creates_feedback_using_token_identity() -> None:
    user_id = uuid4()
    identity = Identity(
        id=user_id,
        type=IdentityType.USER,
        email=Email("user@example.com"),
    )
    client, session, publisher = _client(identity)

    response = client.post(
        "/api/v1/feedbacks",
        json={"rating": 5, "comment": "  Отлично  "},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == str(user_id)
    assert body["email"] == "user@example.com"
    assert body["rating"] == 5
    assert body["comment"] == "Отлично"
    session.execute.assert_awaited_once()
    session.scalar.assert_awaited_once()
    session.add.assert_called_once()
    session.commit.assert_awaited_once()
    publisher.publish_all.assert_awaited_once()


def test_http_post_rejects_client_supplied_identity() -> None:
    identity = Identity(
        id=uuid4(),
        type=IdentityType.USER,
        email=Email("user@example.com"),
    )
    client, session, _publisher = _client(identity)

    response = client.post(
        "/api/v1/feedbacks",
        json={"rating": 5, "comment": "Отзыв", "user_id": str(uuid4())},
    )

    assert response.status_code == 422
    session.add.assert_not_called()


def test_http_get_allows_admin_and_applies_pagination_and_rating() -> None:
    identity = Identity(
        id=uuid4(),
        type=IdentityType.USER,
        email=Email("admin@example.com"),
        roles=frozenset({"admin"}),
    )
    client, session, _publisher = _client(identity)

    response = client.get("/api/v1/feedbacks?page=2&size=3&rating=4")

    assert response.status_code == 200
    assert response.json()["page"] == 2
    assert response.json()["size"] == 3
    assert response.json()["items"] == []
    session.scalar.assert_awaited_once()
    statement = session.scalar.await_args.args[0]
    assert 4 in statement.compile().params.values()


def test_http_get_denies_non_admin() -> None:
    identity = Identity(
        id=uuid4(),
        type=IdentityType.USER,
        email=Email("user@example.com"),
        roles=frozenset({"user"}),
    )
    client, session, _publisher = _client(identity)

    response = client.get("/api/v1/feedbacks")

    assert response.status_code == 403
    session.scalar.assert_not_awaited()


@pytest.mark.parametrize("rating", [0, 6])
def test_http_get_rejects_invalid_rating(rating: int) -> None:
    identity = Identity(
        id=uuid4(),
        type=IdentityType.USER,
        email=Email("admin@example.com"),
        roles=frozenset({"admin"}),
    )
    client, session, _publisher = _client(identity)

    response = client.get(f"/api/v1/feedbacks?rating={rating}")

    assert response.status_code == 422
    session.scalar.assert_not_awaited()


def test_http_post_denies_service_account() -> None:
    identity = Identity(id=uuid4(), type=IdentityType.SERVICE_ACCOUNT)
    client, session, _publisher = _client(identity)

    response = client.post("/api/v1/feedbacks", json={"rating": 5, "comment": "Отзыв"})

    assert response.status_code == 403
    session.add.assert_not_called()
