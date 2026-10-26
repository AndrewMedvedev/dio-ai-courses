from uuid import UUID, uuid4

import pytest
from ddf.application.exceptions import (
    AlreadyExistsError,
    NotFoundError,
    OperationNotAllowedError,
)
from ddf.application.utils import get_or_raise_not_found
from ddf.domain.exceptions import DomainError, InvalidStateError, InvariantViolationError
from ddf.domain.models import Entity
from fastapi import FastAPI, status
from httpx import ASGITransport, AsyncClient, Response

from src.iam.domain.exceptions import PermissionDeniedError, WeakPasswordError
from src.iam.domain.exceptions import UnauthorizedError as IamUnauthorizedError
from src.shared.api.exception_handler import setup_exception_handlers
from src.shared.domain.exceptions import (
    BadRequestError,
    EmailSendingFailedError,
    ForbiddenError,
    RateLimitExceededError,
    UnauthorizedError,
)

_DDF_CASES = [
    (NotFoundError, status.HTTP_404_NOT_FOUND, "not_found", None),
    (AlreadyExistsError, status.HTTP_409_CONFLICT, "already_exists", None),
    (
        InvariantViolationError,
        status.HTTP_409_CONFLICT,
        "INVARIANT_VIOLATION",
        None,
    ),
    (InvalidStateError, status.HTTP_409_CONFLICT, "INVALID_STATE", None),
    (
        OperationNotAllowedError,
        status.HTTP_405_METHOD_NOT_ALLOWED,
        "operation_not_allowed",
        None,
    ),
]


async def _request(app: FastAPI) -> Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get("/")


async def _request_error(error: Exception) -> Response:
    app = FastAPI()
    setup_exception_handlers(app)

    @app.get("/")
    async def fail() -> None:
        raise error

    return await _request(app)


@pytest.mark.asyncio
@pytest.mark.parametrize(("error_type", "status_code", "code", "message"), _DDF_CASES)
async def test_ddf_error_returns_ddf_defaults(
    error_type,
    status_code: int,
    code: str,
    message: str | None,
) -> None:
    response = await _request_error(error_type())

    assert response.status_code == status_code
    assert response.json() == {"error": {"code": code, "message": message, "details": {}}}


@pytest.mark.asyncio
@pytest.mark.parametrize(("error_type", "status_code", "code", "message"), _DDF_CASES)
async def test_ddf_error_preserves_explicit_message_and_details(
    error_type,
    status_code: int,
    code: str,
    message: str | None,
) -> None:
    details = {"field": "email"}
    response = await _request_error(error_type("Explicit error", details=details))

    assert response.status_code == status_code
    assert response.json() == {
        "error": {"code": code, "message": "Explicit error", "details": details},
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "status_code", "code", "message"),
    [
        (BadRequestError(), status.HTTP_400_BAD_REQUEST, "BAD_REQUEST", None),
        (
            UnauthorizedError(),
            status.HTTP_401_UNAUTHORIZED,
            "UNAUTHORIZED",
            None,
        ),
        (ForbiddenError(), status.HTTP_403_FORBIDDEN, "FORBIDDEN", None),
        (
            RateLimitExceededError(),
            status.HTTP_429_TOO_MANY_REQUESTS,
            "RATE_LIMIT_EXCEEDED",
            None,
        ),
        (
            EmailSendingFailedError(),
            status.HTTP_502_BAD_GATEWAY,
            "EMAIL_SENDING_FAILED",
            None,
        ),
        (
            PermissionDeniedError(),
            status.HTTP_403_FORBIDDEN,
            "PERMISSION_DENIED",
            None,
        ),
        (
            IamUnauthorizedError(),
            status.HTTP_401_UNAUTHORIZED,
            "UNAUTHORIZED",
            None,
        ),
    ],
)
async def test_project_error_uses_ddf_base(
    error: Exception,
    status_code: int,
    code: str,
    message: str | None,
) -> None:
    assert isinstance(error, DomainError)
    response = await _request_error(error)

    assert response.status_code == status_code
    assert response.json() == {"error": {"code": code, "message": message, "details": {}}}


@pytest.mark.asyncio
async def test_weak_password_preserves_validation_details() -> None:
    response = await _request_error(
        WeakPasswordError(
            "Weak password", suggestions=["Use a longer password"], warning="Too short"
        ),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json() == {
        "error": {
            "code": "WEAK_PASSWORD",
            "message": "Weak password",
            "details": {"suggestions": ["Use a longer password"], "warning": "Too short"},
        },
    }


@pytest.mark.asyncio
async def test_ddf_not_found_helper_returns_http_404() -> None:
    app = FastAPI()
    setup_exception_handlers(app)
    entity_id = uuid4()

    async def load_entity(uid: UUID) -> Entity | None:
        assert uid == entity_id
        return None

    @app.get("/")
    async def read_missing_entity() -> Entity:
        return await get_or_raise_not_found(load_entity, entity_id, Entity)

    response = await _request(app)

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {
        "error": {
            "code": "not_found",
            "message": f"Entity with ID {entity_id} not found.",
            "details": {},
        },
    }
