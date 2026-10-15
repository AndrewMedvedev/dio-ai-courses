import os
from uuid import uuid4

import pytest

from src.courses.application.dtos import SearchParams
from src.courses.domain.enums import CourseStatus, DifficultyLevel
from src.courses.infra.database.models import CourseOrm
from src.courses.infra.database.repos.course import SqlCourseRepository

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        os.getenv("RUN_COURSE_SEARCH_DB_TESTS") != "1",
        reason="Set RUN_COURSE_SEARCH_DB_TESTS=1 to use a disposable PostgreSQL container",
    ),
]


def course(title, *, status=CourseStatus.PUBLISHED):
    return CourseOrm(
        id=uuid4(),
        creator_id=uuid4(),
        title=title,
        description="Основы программирования",
        difficulty=DifficultyLevel.BEGINNER,
        tags=[],
        status=status,
        learning_objectives=[],
    )


async def test_keywords_filter_before_pagination_and_exclude_drafts(session):
    first, second = course("Python A"), course("Python B")
    session.add_all([first, second, course("Python C", status=CourseStatus.DRAFT), course("Java")])
    await session.flush()
    params = SearchParams(
        page=2,
        size=1,
        query={"query": "Python программирование"},
        sort={"field": "title", "direction": "asc"},
    )
    page = await SqlCourseRepository(session).find(params)
    assert page.total == len([first, second])
    assert page.pages == page.total
    assert [item.id for item in page.items] == [second.id]


async def test_json_uuid_and_date_filters_execute_on_postgres(session):
    item = course("Python")
    session.add(item)
    await session.flush()
    params = SearchParams(
        query={
            "op": "$and",
            "filters": [
                {"field": "id", "op": "$eq", "value": str(item.id)},
                {"field": "createdAt", "op": "$gte", "value": "2020-01-01T00:00:00Z"},
            ],
        }
    )
    page = await SqlCourseRepository(session).find(params)
    assert page.total == 1
    assert page.items[0].id == item.id


async def test_user_search_cannot_return_another_authors_courses(session):
    own, other = course("Python"), course("Python")
    session.add_all([own, other])
    await session.flush()
    page = await SqlCourseRepository(session).find_user_courses(
        own.creator_id,
        SearchParams(query={"query": "Python"}),
    )
    assert page.total == 1
    assert page.items[0].id == own.id
