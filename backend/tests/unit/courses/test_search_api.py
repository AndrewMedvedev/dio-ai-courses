import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, status
from httpx import ASGITransport, AsyncClient

from src.courses.api.v1 import router
from src.courses.api.v1.invitations import router as invitations_router
from src.courses.application.dtos import SearchParams
from src.courses.dependencies import base, services
from src.courses.domain.permissions.courses import UPDATE
from src.courses.domain.permissions.theory_session import READ
from src.courses.infra.database.repos.course import SqlCourseRepository
from src.iam.dependencies.identity import get_current_identity
from src.shared.api.exception_handler import setup_exception_handlers
from src.shared.application.dtos import Page

COURSE_ID, LESSON_ID, USER_ID = uuid4(), uuid4(), uuid4()
CASES = [
    ("POST", "/courses/search", base.get_course_repo, "find"),
    ("POST", "/courses/my-courses", base.get_course_repo, "find_user_courses"),
    ("GET", "/members", services.get_member_service, "get_my_courses"),
    ("GET", f"/members/{COURSE_ID}", base.get_member_repo, "find_by_course"),
    (
        "GET",
        f"/progress/courses/{COURSE_ID}/students",
        base.get_course_progress_repo,
        "find_by_course",
    ),
    (
        "GET",
        f"/courses/invitations?course_id={COURSE_ID}",
        services.get_invitation_service,
        "get_course_invitations",
    ),
    ("GET", f"/theory-sessions/{LESSON_ID}/users/{USER_ID}", base.get_theory_session_repo, "find"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        {"query": {"field": "creatorId", "op": "$eq", "value": str(USER_ID)}},
        {"sort": {"field": "private", "direction": "desc"}},
    ],
)
async def test_invalid_search_fields_return_400_without_database_access(body):
    app = FastAPI()
    app.include_router(router)
    setup_exception_handlers(app)
    session = AsyncMock()
    app.dependency_overrides[base.get_course_repo] = lambda: SqlCourseRepository(session)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/courses/search", json=body)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    session.scalar.assert_not_awaited()
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(("http_method", "path", "dependency", "method"), CASES)
@pytest.mark.parametrize("with_search", [False, True])
async def test_existing_routes_and_response_formats_remain_compatible(
    http_method,
    path,
    dependency,
    method,
    with_search,
):
    app = FastAPI()
    app.include_router(invitations_router if path.startswith("/courses/invitations") else router)
    loader = AsyncMock()
    theory = path.startswith("/theory-sessions/")
    getattr(loader, method).return_value = (
        [] if theory else Page.create([], total=0, page=2, size=5)
    )
    check_access = AsyncMock()
    app.dependency_overrides[dependency] = lambda: loader
    app.dependency_overrides[get_current_identity] = lambda: SimpleNamespace(
        id=USER_ID,
        permissions=frozenset({UPDATE.code, READ.code}),
    )
    app.dependency_overrides[services.get_check_course_access] = lambda: check_access
    app.dependency_overrides[services.get_check_lesson_access] = lambda: check_access
    body = {"page": 2, "size": 5}
    if with_search:
        body.update(
            query={"field": "id", "op": "$ne", "value": str(uuid4())},
            sort={"field": "createdAt", "direction": "desc"},
        )
    request_args = (
        {"json": body}
        if http_method == "POST"
        else {
            "params": {
                **(
                    {"course_id": str(COURSE_ID)}
                    if path.startswith("/courses/invitations")
                    else {}
                ),
                **body,
                **(
                    {"query": json.dumps(body["query"]), "sort": "createdAt:desc"}
                    if with_search
                    else {}
                ),
            },
        }
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(http_method, path, **request_args)
        invalid_args = (
            {"json": {"size": 101}}
            if http_method == "POST"
            else {
                "params": {"created_from": "invalid"} if theory else {"size": 101},
            }
        )
        invalid = await client.request(http_method, path, **invalid_args)
    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.json() == [] if theory else response.json()["page"] == body["page"]
    assert invalid.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    called = getattr(loader, method).await_args
    if theory:
        assert called.kwargs["filters"].query == (
            json.dumps(body["query"]) if with_search else None
        )
    else:
        pagination = called.kwargs.get("pagination")
        if pagination is None:
            pagination = next(arg for arg in called.args if isinstance(arg, SearchParams))
        assert pagination.model_dump(mode="json", exclude_none=True) == body
    if path.startswith(("/progress/", "/theory-sessions/")):
        check_access.assert_awaited_once()


@pytest.mark.asyncio
async def test_plain_keyword_search_in_existing_catalog_endpoint():
    app = FastAPI()
    app.include_router(router)
    session = AsyncMock()
    session.scalar.return_value = 0
    app.dependency_overrides[base.get_course_repo] = lambda: SqlCourseRepository(session)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/courses/search", json={"page": 1, "size": 10, "search": "Python"}
        )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["items"] == []
    statement = str(session.scalar.await_args.args[0])
    assert "plainto_tsquery" in statement
    assert "courses.status" in statement
