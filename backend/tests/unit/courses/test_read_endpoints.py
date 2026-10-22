import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from ddf.application.dsl import Condition
from fastapi import FastAPI
from fastapi import status as http_status
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.api.v1 import course, lesson, member, module
from src.courses.application.dtos import CourseBasicInfo
from src.courses.dependencies import base, services
from src.courses.domain.enums import CourseStatus, DifficultyLevel
from src.courses.domain.permissions.courses import READ, UPDATE
from src.courses.infra.database.repos.course import SqlCourseRepository
from src.courses.infra.database.repos.member import SqlMemberRepository
from src.iam.application.dtos import Identity, IdentityType
from src.iam.dependencies.identity import get_current_identity
from src.iam.domain.exceptions import PermissionDeniedError
from src.organization.api.v1 import organization
from src.organization.dependencies.base import get_organization_repo
from src.organization.domain.permissions.organizations import ORGANIZATION_READ
from src.organization.domain.permissions.organizations import READ as READ_ORGANIZATIONS
from src.organization.infra.database.repos.organization import SqlOrganizationRepository
from src.shared.api.exception_handler import setup_exception_handlers
from src.shared.application.dtos import Page, SearchParams


def _dependency(value):
    return lambda: value


@pytest.fixture
def read_app():
    """Только проверяемые роутеры: без lifespan, БД, сервисов генерации и внешних вызовов."""
    app = FastAPI()
    setup_exception_handlers(app)
    for router in (
        course.router,
        module.router,
        lesson.router,
        member.router,
        organization.router,
    ):
        app.include_router(router)
    identity = Identity(
        id=uuid4(),
        organization_id=uuid4(),
        type=IdentityType.USER,
        permissions=frozenset({UPDATE.code, READ_ORGANIZATIONS.code, ORGANIZATION_READ.code}),
    )
    repositories = {}
    for name, dependency in (
        ("course", base.get_course_repo),
        ("module", base.get_module_repo),
        ("lesson", base.get_lesson_repo),
        ("member", base.get_member_repo),
        ("organization", get_organization_repo),
    ):
        repository = AsyncMock()
        for method in ("find", "find_user_courses", "find_member_courses", "find_by_course"):
            getattr(repository, method).return_value = Page.create([], total=4, page=2, size=3)
        repositories[name] = repository
        app.dependency_overrides[dependency] = _dependency(repository)
    access = AsyncMock()
    app.dependency_overrides[get_current_identity] = lambda: identity
    app.dependency_overrides[services.get_check_module_access] = lambda: access
    app.dependency_overrides[services.get_check_lesson_access] = lambda: access
    return app, repositories, identity, access


LIST_ENDPOINTS = [
    ("POST", "/courses/search", "course", "find", None),
    ("POST", "/courses/my-courses", "course", "find_user_courses", "identity"),
    ("GET", "/members", "course", "find_member_courses", "identity"),
    ("GET", "/members/{course_id}", "member", "find_by_course", "course"),
    ("GET", "/organizations", "organization", "find", None),
]


@pytest.mark.parametrize(("method", "path", "repo_name", "operation", "scope"), LIST_ENDPOINTS)
def test_list_endpoints_parse_dsl_without_changing_routes_or_page(
    read_app, method, path, repo_name, operation, scope
):
    app, repositories, identity, _ = read_app
    course_id = uuid4()
    query = {"field": "created_at", "op": "$gte", "value": "2026-10-20T00:00:00Z"}
    data = {"page": 2, "size": 3, "query": query}
    if method == "POST":
        request = {"json": {**data, "sort": {"field": "created_at", "direction": "asc"}}}
    else:
        request = {"params": {**data, "query": json.dumps(query), "sort": "created_at:asc"}}
    with TestClient(app) as client:
        response = client.request(method, path.format(course_id=course_id), **request)

    assert response.status_code == http_status.HTTP_200_OK
    assert response.json() == Page.create([], total=4, page=2, size=3).model_dump()
    call = getattr(repositories[repo_name], operation).await_args
    assert getattr(repositories[repo_name], operation).await_count == 1
    pagination = call.kwargs["pagination"] if call.kwargs else call.args[-1]
    assert isinstance(pagination, SearchParams)
    assert pagination.page == data["page"]
    assert pagination.size == data["size"]
    assert isinstance(pagination.query, Condition)
    assert pagination.query.field == "created_at"
    assert pagination.query.op == "$gte"
    assert pagination.sort is not None
    assert pagination.sort.field == "created_at"
    assert pagination.sort.direction == "asc"
    if scope is not None:
        assert call.args[0] == (identity.id if scope == "identity" else course_id)


@pytest.mark.parametrize("path", ["/courses/search", "/courses/my-courses"])
def test_existing_pagination_only_body_is_still_accepted(read_app, path):
    app, repositories, _, _ = read_app
    with TestClient(app) as client:
        response = client.post(path, json={"page": 2, "size": 3})
    assert response.status_code == http_status.HTTP_200_OK
    operation = "find" if path == "/courses/search" else "find_user_courses"
    pagination = getattr(repositories["course"], operation).await_args.args[-1]
    assert pagination.query is None
    assert pagination.sort is None


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"query": "{broken"}, 422),
        ({"query": json.dumps({"field": "id", "op": "$unknown", "value": 1})}, 422),
        ({"sort": "created_at:sideways"}, 400),
        ({"page": 0}, 422),
    ],
)
def test_invalid_query_parameters_are_rejected_before_repository(read_app, params, status):
    app, repositories, _, _ = read_app
    with TestClient(app) as client:
        response = client.get("/members", params=params)
    assert response.status_code == status
    repositories["course"].find_member_courses.assert_not_awaited()


def test_invalid_body_operator_is_rejected_before_repository(read_app):
    app, repositories, _, _ = read_app
    with TestClient(app) as client:
        response = client.post(
            "/courses/search", json={"query": {"field": "id", "op": "$unknown", "value": 1}}
        )
    assert response.status_code == http_status.HTTP_422_UNPROCESSABLE_CONTENT
    repositories["course"].find.assert_not_awaited()


@pytest.mark.parametrize(
    ("path", "repo_name", "operation"),
    [
        ("/members/{uid}", "member", "find_by_course"),
        ("/organizations", "organization", "find"),
        ("/organizations/{uid}", "organization", "read"),
    ],
)
def test_existing_permission_checks_still_forbid_reading(read_app, path, repo_name, operation):
    app, repositories, identity, _ = read_app
    app.dependency_overrides[get_current_identity] = lambda: Identity(
        id=identity.id, organization_id=identity.organization_id, type=identity.type
    )
    with TestClient(app) as client:
        response = client.get(path.format(uid=uuid4()))
    assert response.status_code == http_status.HTTP_403_FORBIDDEN
    getattr(repositories[repo_name], operation).assert_not_awaited()


@pytest.mark.parametrize("resource", ["courses", "modules", "lessons"])
@pytest.mark.parametrize("exists", [True, False])
def test_basic_info_reads_repository_directly_and_preserves_access_and_404(
    read_app, resource, exists
):
    app, repositories, identity, access = read_app
    uid = uuid4()
    repo_name = {"courses": "course", "modules": "module", "lessons": "lesson"}[resource]
    repository = repositories[repo_name]
    info = (
        CourseBasicInfo(
            id=uid,
            title="Course",
            description="Description",
            difficulty=DifficultyLevel.BEGINNER,
            tags=[],
        )
        if resource == "courses"
        else {"id": str(uid), "title": "Basic info", "order": 1}
    )
    repository.get_by_id_basic_info.return_value = info if exists else None
    with TestClient(app) as client:
        response = client.get(f"/{resource}/{uid}")
    assert response.status_code == (200 if exists else 404)
    repository.get_by_id_basic_info.assert_awaited_once_with(uid)
    if exists:
        assert response.json()["id"] == str(uid)
    if resource != "courses":
        access.assert_awaited_once_with(identity=identity, permission=READ, uid=uid)


def test_by_id_routes_do_not_add_dsl_parameters(read_app):
    app, _, _, _ = read_app
    paths = app.openapi()["paths"]
    for path in (
        "/courses/{course_id}",
        "/modules/{module_id}",
        "/lessons/{lesson_id}",
        "/organizations/{organization_id}",
    ):
        assert all(param["in"] != "query" for param in paths[path]["get"].get("parameters", []))


def test_failed_object_access_does_not_read_lesson(read_app):
    app, repositories, _, access = read_app
    access.side_effect = PermissionDeniedError("Access denied")
    with TestClient(app) as client:
        response = client.get(f"/lessons/{uuid4()}")
    assert response.status_code == http_status.HTTP_403_FORBIDDEN
    repositories["lesson"].get_by_id_basic_info.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("repository_type", "operation", "scope", "query_field", "query_value", "required_sql"),
    [
        (SqlCourseRepository, "find", False, "title", "Python", "courses.status ="),
        (
            SqlCourseRepository,
            "find_user_courses",
            True,
            "title",
            "Python",
            "courses.creator_id =",
        ),
        (SqlCourseRepository, "find_member_courses", True, "title", "Python", "members.user_id ="),
        (SqlMemberRepository, "find_by_course", True, "role", "student", "members.course_id ="),
        (SqlOrganizationRepository, "find", False, "name", "DIO", "organizations.name ="),
    ],
)
async def test_repository_filters_count_and_rows_without_losing_scope(
    repository_type, operation, scope, query_field, query_value, required_sql
):
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = 4
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    session.execute.return_value = result
    repository = repository_type(session)
    scope_id = uuid4()
    pagination = SearchParams.model_validate(
        {
            "page": 2,
            "size": 3,
            "query": {"field": query_field, "op": "$eq", "value": query_value},
            "sort": {"field": "created_at", "direction": "asc"},
        }
    )

    args = (scope_id, pagination) if scope else (pagination,)
    page = await getattr(repository, operation)(*args)

    count = session.scalar.await_args.args[0].compile(dialect=postgresql.dialect())
    rows = session.execute.await_args.args[0].compile(dialect=postgresql.dialect())
    for statement in (count, rows):
        sql = str(statement)
        assert required_sql in sql
        assert f".{query_field} =" in sql
        if scope:
            assert scope_id in statement.params.values()
        if operation == "find_member_courses":
            assert "JOIN members" in sql
            assert [CourseStatus.ARCHIVED, CourseStatus.DRAFT] in statement.params.values()
        if repository_type is SqlCourseRepository and operation == "find":
            assert CourseStatus.PUBLISHED in statement.params.values()
    assert "LIMIT" not in str(count)
    assert "OFFSET" not in str(count)
    assert "created_at ASC" in str(rows)
    assert "created_at DESC" not in str(rows)
    assert page.total == session.scalar.return_value
    assert page.page == pagination.page
    assert page.size == pagination.size
    assert "LIMIT" in str(rows)
    assert "OFFSET" in str(rows)


@pytest.mark.asyncio
async def test_repository_converts_http_uuid_and_datetime_before_database_driver():
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = 0
    uid = uuid4()
    since = datetime(2026, 10, 20, tzinfo=UTC)
    pagination = SearchParams.model_validate(
        {
            "query": {
                "op": "$and",
                "filters": [
                    {"field": "id", "op": "$eq", "value": str(uid)},
                    {"field": "created_at", "op": "$gte", "value": since.isoformat()},
                ],
            }
        }
    )

    result = await SqlCourseRepository(session).find(pagination)

    compiled = session.scalar.await_args.args[0].compile(dialect=postgresql.dialect())
    assert any(isinstance(value, UUID) and value == uid for value in compiled.params.values())
    assert any(
        isinstance(value, datetime) and value == since for value in compiled.params.values()
    )
    session.execute.assert_not_awaited()
    assert result.total == 0
