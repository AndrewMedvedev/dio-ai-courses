import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from src.courses.application.dtos import LessonTheorySessionFilters, SearchParams
from src.courses.domain.enums import CourseStatus
from src.courses.infra.database.models import CourseOrm
from src.courses.infra.database.repos.course import SqlCourseRepository
from src.courses.infra.database.repos.course_progress import SqlCourseProgressRepository
from src.courses.infra.database.repos.invitation import SqlInvitationRepository
from src.courses.infra.database.repos.member import SqlMemberRepository
from src.courses.infra.database.repos.theory_session import SqlLessonTheorySessionRepository
from src.courses.infra.database.search import search_page

FIELDS = ("id", "title", "description", "createdAt")


@pytest.mark.asyncio
async def test_keyword_search_without_text_fields_is_rejected_not_ignored():
    session = AsyncMock()
    with pytest.raises(ValueError, match="Full-text search is not supported"):
        await search_page(
            session=session,
            model=CourseOrm,
            stmt=select(CourseOrm),
            pagination=SearchParams(query={"query": "Python"}),
            mapper=lambda item: item,
            fields=FIELDS,
        )
    session.scalar.assert_not_awaited()


def compiled(statement):
    return statement.compile(dialect=postgresql.dialect())


@pytest.mark.asyncio
async def test_keywords_use_ddf_search_and_bound_postgres_full_text_query():
    session = AsyncMock()
    session.scalar.return_value = 1
    session.execute.return_value = Mock()
    row = SimpleNamespace(id=uuid4())
    session.execute.return_value.scalars.return_value.all.return_value = [row]
    text = "Основы Python ' OR 1=1 --"
    params = SearchParams(
        query={"query": text}, page=2, size=1, sort={"field": "title", "direction": "asc"}
    )

    result = await search_page(
        session=session,
        model=CourseOrm,
        stmt=select(CourseOrm),
        pagination=params,
        mapper=lambda item: item.id,
        fields=FIELDS,
        text_fields=("title", "description"),
    )

    query = compiled(session.execute.await_args.args[0])
    assert "to_tsvector" in str(query)
    assert "plainto_tsquery" in str(query)
    assert "ORDER BY courses.title ASC" in str(query)
    assert text not in str(query)
    assert text in query.params.values()
    assert 1 in query.params.values()
    assert result.items == [row.id]
    assert result.page == params.page
    assert result.total == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"query": {"field": "creatorId", "op": "$eq", "value": "private"}},
        {"sort": {"field": "creatorId", "direction": "asc"}},
        {"query": {"field": "id", "op": "$eq", "value": "not-a-uuid"}},
        {"query": {"field": "title", "op": "$in", "value": "not-a-list"}},
    ],
)
async def test_invalid_filter_or_sort_fails_before_database_query(payload):
    session = AsyncMock()
    with pytest.raises(ValueError, match=r"Unknown filter field|Сортировка|UUID|список"):
        await search_page(
            session=session,
            model=CourseOrm,
            stmt=select(CourseOrm),
            pagination=SearchParams(**payload),
            mapper=lambda item: item,
            fields=FIELDS,
            text_fields=("title", "description"),
        )
    session.scalar.assert_not_awaited()
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_nested_filters_restore_uuid_and_datetime_types():
    session = AsyncMock()
    session.scalar.return_value = 0
    uid = uuid4()
    params = SearchParams(
        query={
            "op": "$and",
            "filters": [
                {"field": "id", "op": "$in", "value": [str(uid)]},
                {"filter": {"field": "createdAt", "op": "$lt", "value": "2026-01-01T00:00:00Z"}},
            ],
        }
    )
    await search_page(
        session=session,
        model=CourseOrm,
        stmt=select(CourseOrm),
        pagination=params,
        mapper=lambda item: item,
        fields=FIELDS,
    )
    params = compiled(session.scalar.await_args.args[0]).params
    assert any(isinstance(value, datetime) for value in params.values())
    assert any(isinstance(value, list) and value == [UUID(str(uid))] for value in params.values())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "scope", "required"),
    [
        ("find", (), "courses.status"),
        ("find_user_courses", (uuid4(),), "courses.creator_id"),
        ("find_member_courses", (uuid4(),), "members.user_id"),
    ],
)
async def test_course_filters_cannot_replace_catalog_or_user_scope(method, scope, required):
    session = AsyncMock()
    session.scalar.return_value = 0
    repository = SqlCourseRepository(session)
    params = SearchParams(
        query={
            "op": "$or",
            "filters": [
                {"field": "status", "op": "$eq", "value": CourseStatus.DRAFT.value},
                {"query": "Python"},
            ],
        }
    )
    page = await getattr(repository, method)(*scope, params)
    statement = compiled(session.scalar.await_args.args[0])
    assert required in str(statement)
    assert " AND " in str(statement)
    if method == "find":
        assert CourseStatus.PUBLISHED in statement.params.values()
    else:
        assert scope[0] in statement.params.values()
    assert page.total == 0
    assert page.items == []
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("repo_type", "required"),
    [
        (SqlMemberRepository, "members.course_id"),
        (SqlCourseProgressRepository, "course_progress.course_id"),
        (SqlInvitationRepository, "course_invitations.course_id"),
    ],
)
async def test_scoped_lists_keep_course_constraint(repo_type, required):
    session = AsyncMock()
    session.scalar.return_value = 0
    course_id = uuid4()
    params = SearchParams(query={"field": "id", "op": "$ne", "value": str(uuid4())})
    page = await repo_type(session).find_by_course(course_id, params)
    statement = compiled(session.scalar.await_args.args[0])
    assert required in str(statement)
    assert course_id in statement.params.values()
    assert page.items == []
    if repo_type is SqlInvitationRepository:
        assert "is_used IS false" in str(statement)
        assert "expires_at >" in str(statement)


@pytest.mark.asyncio
async def test_theory_sessions_keep_lesson_and_user_scope_with_date_filters():
    session = AsyncMock()
    session.execute.return_value = Mock()
    session.execute.return_value.scalars.return_value.all.return_value = []
    lesson_id, user_id = uuid4(), uuid4()
    page = await SqlLessonTheorySessionRepository(session).find(
        lesson_id=lesson_id,
        user_id=user_id,
        filters=LessonTheorySessionFilters(
            query=json.dumps(
                {
                    "field": "createdAt",
                    "op": "$gte",
                    "value": "2026-01-01T00:00:00Z",
                }
            )
        ),
    )
    statement = compiled(session.execute.await_args.args[0])
    assert lesson_id in statement.params.values()
    assert user_id in statement.params.values()
    assert "lesson_theory_sessions.created_at >=" in str(statement)
    assert page == []


@pytest.mark.parametrize(
    "payload",
    [
        {"page": 0},
        {"size": 101},
        {"sort": {"field": "title", "direction": "invalid"}},
        {"query": {"field": "title", "op": "$sql", "value": "anything"}},
    ],
)
def test_search_request_validation(payload):
    with pytest.raises(ValidationError):
        SearchParams(**payload)
