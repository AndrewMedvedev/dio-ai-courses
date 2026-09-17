from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.courses.infra.database.repos.student import SqlStudentRepository
from src.courses.infra.models import StudentOrm
from src.shared.application.dtos import Page, Pagination


@pytest.fixture
def session():
    """Создаёт мок сессии базы данных."""
    return AsyncMock()


class TestStudentRepository:
    @pytest.mark.asyncio
    async def test_read_returns_student(self, session):
        """Возвращает ученика, записанного на курс."""
        user_id = uuid4()
        course_id = uuid4()
        model = StudentOrm(
            id=uuid4(),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            user_id=user_id,
            course_id=course_id,
        )
        result = MagicMock()
        result.scalar_one_or_none.return_value = model
        session.execute.return_value = result
        repository = SqlStudentRepository(session)

        student = await repository.read(user_id, course_id)

        assert student is not None
        assert student.id == model.id
        assert student.user_id == user_id
        assert student.course_id == course_id
        session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_read_returns_none_when_student_not_found(self, session):
        """Возвращает пустой результат для незаписанного ученика."""
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        session.execute.return_value = result
        repository = SqlStudentRepository(session)

        student = await repository.read(uuid4(), uuid4())

        assert student is None
        session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_find_by_course_returns_page(self, session):
        """Передаёт выборку учеников курса в общий пагинатор."""
        repository = SqlStudentRepository(session)
        page = Page.create([], total=0, page=1, size=10)

        with patch(
            "src.courses.infra.database.repos.student.paginate",
            new_callable=AsyncMock,
            return_value=page,
        ) as paginate:
            result = await repository.find_by_course(uuid4(), Pagination())

        assert result == page
        paginate.assert_awaited_once()
