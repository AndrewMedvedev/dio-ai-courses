from collections.abc import AsyncIterator
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI, status
from httpx import ASGITransport, AsyncClient

from src.core.settings import settings
from src.courses.api.v1.course import router
from src.courses.application.dtos import CourseBasicInfo
from src.courses.dependencies.base import get_course_repo, get_member_repo
from src.courses.dependencies.services import get_course_service
from src.courses.domain.enums import DifficultyLevel
from src.courses.domain.vo import MemberRole
from src.iam.application.dtos import IdentityType
from src.iam.dependencies.repos import get_cache
from src.iam.domain.vo import Email
from src.iam.security import create_access_token
from src.shared.api.exception_handler import setup_exception_handlers
from src.shared.infra.cache.in_memory import InMemoryCache

READ = "course.course_read"
UPDATE = "course.update"
DELETE = "course.delete"
PRACTICE = "practice.read"
THEORY = "theory_session.read"
INVITE = "course-invitations.invite"
ALL_GRANTS = {READ, UPDATE, DELETE, PRACTICE, THEORY, INVITE, "course.create"}


@pytest.fixture
def course_app(monkeypatch: pytest.MonkeyPatch) -> tuple[FastAPI, AsyncMock, AsyncMock]:
    monkeypatch.setattr(settings, "secret_key", "course-permissions-test-secret-at-least-32-chars")
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    setup_exception_handlers(app)
    course_repo, member_repo = AsyncMock(), AsyncMock()
    cache = InMemoryCache[bool]()
    app.dependency_overrides[get_course_repo] = lambda: course_repo
    app.dependency_overrides[get_member_repo] = lambda: member_repo
    app.dependency_overrides[get_cache] = lambda: cache
    return app, course_repo, member_repo


@pytest_asyncio.fixture
async def client(course_app: tuple[FastAPI, AsyncMock, AsyncMock]) -> AsyncIterator[AsyncClient]:
    app, _, _ = course_app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


def auth_headers(user_id: UUID, permissions: set[str] | None = None) -> dict[str, str]:
    token = create_access_token(
        identity_id=user_id,
        identity_type=IdentityType.USER,
        organization_id=uuid4(),
        roles={"test"},
        permissions=ALL_GRANTS if permissions is None else permissions,
        email=Email("permissions@example.com"),
        membership_id=uuid4(),
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "is_creator", "expected"),
    [
        (MemberRole.STUDENT, False, {READ, INVITE}),
        (MemberRole.MODERATOR, False, {READ, PRACTICE, THEORY, INVITE}),
        (MemberRole.TEACHER, False, {READ, UPDATE, PRACTICE, THEORY, INVITE}),
        (None, True, ALL_GRANTS - {"course.create"}),
        (None, False, set()),
    ],
)
async def test_permissions_use_current_user_and_course_without_writes(
    client: AsyncClient,
    course_app: tuple[FastAPI, AsyncMock, AsyncMock],
    role: MemberRole | None,
    is_creator: bool,
    expected: set[str],
) -> None:
    _, course_repo, member_repo = course_app
    user_id, course_id = uuid4(), uuid4()
    course_repo.read_course_ownership.return_value = (
        course_id,
        user_id if is_creator else uuid4(),
    )
    member_repo.read_role.return_value = role

    response = await client.get(
        f"/api/v1/courses/{course_id}/permissions",
        headers=auth_headers(user_id, {"unrelated.read"}),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"permissions": sorted(expected)}
    course_repo.read_course_ownership.assert_awaited_once_with(course_id)
    member_repo.read_role.assert_awaited_once_with(user_id, course_id)
    for repository in (course_repo, member_repo):
        for method in ("create", "update", "delete", "commit"):
            getattr(repository, method).assert_not_called()


@pytest.mark.asyncio
async def test_account_permissions_do_not_change_course_role_permissions(
    client: AsyncClient,
    course_app: tuple[FastAPI, AsyncMock, AsyncMock],
) -> None:
    _, course_repo, member_repo = course_app
    user_id, course_id = uuid4(), uuid4()
    course_repo.read_course_ownership.return_value = (course_id, uuid4())
    member_repo.read_role.return_value = MemberRole.TEACHER

    for account_permissions in (ALL_GRANTS, {"unrelated.read"}):
        response = await client.get(
            f"/api/v1/courses/{course_id}/permissions",
            headers=auth_headers(user_id, account_permissions),
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"permissions": sorted({READ, UPDATE, PRACTICE, THEORY, INVITE})}


@pytest.mark.asyncio
@pytest.mark.parametrize("authorization", [None, "Bearer invalid-token"])
async def test_permissions_require_valid_jwt(
    client: AsyncClient,
    course_app: tuple[FastAPI, AsyncMock, AsyncMock],
    authorization: str | None,
) -> None:
    _, course_repo, member_repo = course_app
    headers = {} if authorization is None else {"Authorization": authorization}

    response = await client.get(f"/api/v1/courses/{uuid4()}/permissions", headers=headers)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    course_repo.read_course_ownership.assert_not_awaited()
    member_repo.read_role.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_course_returns_404(
    client: AsyncClient,
    course_app: tuple[FastAPI, AsyncMock, AsyncMock],
) -> None:
    _, course_repo, member_repo = course_app
    course_repo.read_course_ownership.return_value = None

    response = await client.get(
        f"/api/v1/courses/{uuid4()}/permissions",
        headers=auth_headers(uuid4()),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    member_repo.read_role.assert_not_awaited()


@pytest.mark.asyncio
async def test_invalid_course_id_returns_422(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/courses/not-a-uuid/permissions",
        headers=auth_headers(uuid4()),
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.asyncio
async def test_query_cannot_select_another_users_permissions(
    client: AsyncClient,
    course_app: tuple[FastAPI, AsyncMock, AsyncMock],
) -> None:
    _, course_repo, member_repo = course_app
    user_id, course_id = uuid4(), uuid4()
    course_repo.read_course_ownership.return_value = (course_id, uuid4())
    member_repo.read_role.return_value = None

    response = await client.get(
        f"/api/v1/courses/{course_id}/permissions",
        params={"user_id": str(uuid4())},
        headers=auth_headers(user_id),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"permissions": []}
    member_repo.read_role.assert_awaited_once_with(user_id, course_id)


@pytest.mark.asyncio
async def test_public_course_info_remains_public(
    client: AsyncClient,
    course_app: tuple[FastAPI, AsyncMock, AsyncMock],
) -> None:
    app, _, _ = course_app
    course_id = uuid4()
    service = AsyncMock()
    service.get_basic_info.return_value = CourseBasicInfo(
        id=course_id,
        title="Public course",
        description="Original response",
        difficulty=DifficultyLevel.BEGINNER,
        tags=[],
    )
    app.dependency_overrides[get_course_service] = lambda: service

    response = await client.get(f"/api/v1/courses/{course_id}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "id": str(course_id),
        "title": "Public course",
        "description": "Original response",
        "difficulty": DifficultyLevel.BEGINNER.value,
        "tags": [],
        "learning_objectives": [],
        "modules": [],
    }
    service.get_basic_info.assert_awaited_once_with(course_id)
